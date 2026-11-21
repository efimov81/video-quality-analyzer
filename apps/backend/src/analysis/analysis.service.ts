import { localizedException } from '../common/api-message';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { existsSync, statSync } from 'node:fs';
import { DATABASE, DatabaseConnection } from '../database/database.module';
import { acceptanceProfiles, analysisCheckResults, analysisEvidence, analysisRuns, jobs } from '../database/schema';
import { AnalysisQueueService } from './analysis-queue.service';
import { AnalysisEvidenceInput, AnalyzerInput, CheckResultInput, MediaInfo, ProfileSnapshot, VideoAnalyzer } from './analysis.models';
import { MediaToolsService } from './media-tools.service';
import { CheckType, criterionEnabled, isRecord, normalizeCriteria } from './profile-criteria';
import type { SessionUser } from '../auth/auth.models';
import { accessDenied } from '../auth/session.guard';
import { VIDEO_ANALYZERS } from './analysis.constants';

const CHECK_TYPES: CheckType[] = [
  'resolution', 'audio_presence', 'audio_silence', 'scene_cuts', 'audio_loudness', 'audio_clipping',
  'background_noise', 'speech_vad', 'visual_brightness', 'blur', 'black_screens', 'frozen_frames', 'upscaling_experimental',
];

@Injectable()
export class AnalysisService {
  constructor(
    @Inject(DATABASE) private readonly connection: DatabaseConnection,
    @Inject(VIDEO_ANALYZERS) private readonly analyzers: VideoAnalyzer[],
    private readonly tools: MediaToolsService,
    private readonly queue: AnalysisQueueService,
  ) {}

  async create(videoId: string, profileId: string, user: SessionUser) {
    const run = await this.connection.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${videoId}), hashtext(${profileId}))`);
      const [video] = await tx.select().from(jobs).where(eq(jobs.id, videoId)).limit(1);
      if (video && user.role !== 'admin' && video.createdByUserId !== user.id) throw accessDenied();
      if (!video || video.status !== 'DOWNLOADED' || !video.localPath || !existsSync(video.localPath) || !statSync(video.localPath).isFile()) {
        throw localizedException(BadRequestException, 'Видео должно быть скачано и доступно на диске перед анализом.', 'errors.videoUnavailable');
      }
      const [profile] = await tx.select().from(acceptanceProfiles).where(eq(acceptanceProfiles.id, profileId)).limit(1);
      if (!profile) throw localizedException(NotFoundException, 'Профиль не найден.', 'errors.profileNotFound');
      if (!profile.isActive) throw localizedException(BadRequestException, 'Выбранный профиль не активен.', 'errors.profileInactive');
      const [existing] = await tx.select().from(analysisRuns).where(and(
        eq(analysisRuns.videoId, videoId),
        eq(analysisRuns.profileId, profileId),
        inArray(analysisRuns.status, ['QUEUED', 'RUNNING']),
      )).limit(1);
      if (existing) {
        if (user.role !== 'admin' && existing.requestedByUserId !== user.id) {
          throw localizedException(ConflictException, 'Анализ этого видео уже выполняется.', 'errors.analysisAlreadyRunning');
        }
        return existing;
      }

      const profileSnapshot: ProfileSnapshot = {
        id: profile.id,
        name: profile.name,
        version: profile.version,
        criteria: normalizeCriteria(profile.criteria),
      };
      const [created] = await tx.insert(analysisRuns).values({
        videoId,
        profileId,
        requestedByUserId: user.id,
        profileVersion: profile.version,
        profileSnapshot: { ...profileSnapshot },
        status: 'QUEUED',
      }).returning();
      return created;
    });

    try {
      await this.queue.enqueue(run.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Очередь анализа недоступна.';
      await this.connection.db.update(analysisRuns).set({ status: 'FAILED', error: message, errorCode: 'errors.analysisQueue', completedAt: new Date() })
        .where(eq(analysisRuns.id, run.id));
      throw localizedException(ServiceUnavailableException, 'Не удалось поместить анализ в очередь. Проверьте доступность Redis.', 'errors.analysisQueue');
    }
    return run;
  }

  async list(user: SessionUser) {
    return this.connection.db.select({
      run: analysisRuns,
      videoTitle: jobs.title,
      videoPath: jobs.localPath,
    }).from(analysisRuns)
      .innerJoin(jobs, eq(analysisRuns.videoId, jobs.id))
      .where(user.role === 'admin' ? undefined : and(
        eq(analysisRuns.requestedByUserId, user.id),
        eq(jobs.createdByUserId, user.id),
      ))
      .orderBy(desc(analysisRuns.createdAt));
  }

  async get(id: string, user: SessionUser) {
    const run = await this.findRun(id);
    if (user.role === 'admin') return run;
    if (run.requestedByUserId !== user.id) throw accessDenied();

    const [video] = await this.connection.db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.id, run.videoId), eq(jobs.createdByUserId, user.id)))
      .limit(1);
    if (!video) throw accessDenied();
    return run;
  }

  private async findRun(id: string) {
    const [run] = await this.connection.db.select().from(analysisRuns).where(eq(analysisRuns.id, id)).limit(1);
    if (!run) throw localizedException(NotFoundException, 'Запуск анализа не найден.', 'errors.runNotFound');
    return run;
  }

  async report(id: string, user: SessionUser) {
    const run = await this.get(id, user);
    const [video] = await this.connection.db.select().from(jobs).where(eq(jobs.id, run.videoId)).limit(1);
    const checks = await this.connection.db.select().from(analysisCheckResults)
      .where(eq(analysisCheckResults.analysisRunId, id));
    const results = await Promise.all(checks.map(async (check) => ({
      ...check,
      evidence: await this.connection.db.select().from(analysisEvidence)
        .where(eq(analysisEvidence.analysisCheckResultId, check.id))
        .orderBy(analysisEvidence.timestamp),
    })));
    const verdict = this.conclusion(results.map((result) => result.status));
    return { run, video, profile: run.profileSnapshot, conclusion: verdict, checks: results };
  }

  async execute(runId: string): Promise<void> {
    const run = await this.findRun(runId);
    if (run.status === 'COMPLETED') return;
    const [video] = await this.connection.db.select().from(jobs).where(eq(jobs.id, run.videoId)).limit(1);
    if (!video?.localPath || !existsSync(video.localPath) || !statSync(video.localPath).isFile()) {
      await this.connection.db.update(analysisRuns).set({
        status: 'FAILED', error: 'Локальный видеофайл отсутствует.', errorCode: 'errors.localVideoMissing', completedAt: new Date(),
      }).where(eq(analysisRuns.id, runId));
      return;
    }
    if (!isRecord(run.profileSnapshot) || !isRecord(run.profileSnapshot.criteria)) {
      throw new Error('Снимок профиля в запуске анализа повреждён.');
    }
    const criteria = normalizeCriteria(run.profileSnapshot.criteria);
    await this.connection.db.update(analysisRuns).set({ status: 'RUNNING', startedAt: new Date(), error: null, errorCode: null })
      .where(eq(analysisRuns.id, runId));

    let media: MediaInfo | null = null;
    let probeError: unknown;
    try {
      media = await this.tools.probe(video.localPath);
    } catch (error) {
      probeError = error;
    }
    const input: AnalyzerInput = { runId, videoId: video.id, filePath: video.localPath, media, criteria };
    const completedChecks = new Set<CheckType>();

    for (const analyzer of this.analyzers) {
      const enabledTypes = analyzer.checkTypes.filter((type) => criterionEnabled(criteria, type));
      const disabledTypes = analyzer.checkTypes.filter((type) => !criterionEnabled(criteria, type));
      for (const type of disabledTypes) {
        await this.saveResult(runId, {
          checkType: type, status: 'SKIPPED', measuredValue: null, expectedValue: criteria[type],
          messageCode: 'analysis.common.disabled',
          messageParams: {},
          details: 'Проверка отключена в снимке профиля.',
          analyzerVersion: 'not-run/1.0',
        });
        completedChecks.add(type);
      }
      if (!enabledTypes.length) continue;
      if (!media && analyzer.checkTypes.some((type) => ['resolution', 'audio_presence'].includes(type))) {
        for (const type of enabledTypes) {
          await this.saveError(runId, type, probeError, 'analysis.common.probeFailed');
          completedChecks.add(type);
        }
        continue;
      }
      try {
        const results = await analyzer.analyze(input);
        const resultsByType = new Map(results.map((result) => [result.checkType, result]));
        for (const type of enabledTypes) {
          const result = resultsByType.get(type);
          if (!result) await this.saveError(runId, type, new Error('Анализатор не вернул результат проверки.'), 'analysis.common.noResult');
          else await this.saveResult(runId, result);
          completedChecks.add(type);
        }
      } catch (error) {
        for (const type of enabledTypes) {
          await this.saveError(runId, type, error);
          completedChecks.add(type);
        }
      }
    }

    for (const type of CHECK_TYPES) {
      if (completedChecks.has(type)) continue;
      if (!criterionEnabled(criteria, type)) {
        await this.saveResult(runId, {
          checkType: type,
          status: 'SKIPPED',
          measuredValue: null,
          expectedValue: criteria[type],
          messageCode: 'analysis.common.disabled',
          messageParams: {},
          details: 'Проверка отключена в снимке профиля.',
          analyzerVersion: 'not-run/1.0',
        });
      } else {
        await this.saveError(runId, type, new Error('Для проверки не зарегистрирован анализатор.'), 'analysis.common.unregistered');
      }
    }

    await this.connection.db.update(analysisRuns).set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(analysisRuns.id, runId));
  }

  async markFailed(runId: string, error: Error): Promise<void> {
    await this.connection.db.update(analysisRuns).set({ status: 'FAILED', error: error.message.slice(0, 4000), errorCode: 'errors.analysisFailed', completedAt: new Date() })
      .where(eq(analysisRuns.id, runId));
  }

  private async saveError(runId: string, checkType: CheckType, error: unknown, messageCode = 'analysis.common.failed'): Promise<void> {
    const details = error instanceof Error ? error.message : 'Неизвестная ошибка анализатора.';
    await this.saveResult(runId, {
      checkType,
      status: 'ERROR',
      measuredValue: null,
      expectedValue: null,
      messageCode,
      messageParams: {},
      details: details.slice(0, 4000),
      analyzerVersion: 'unknown/1.0',
    });
  }

  private async saveResult(runId: string, result: CheckResultInput): Promise<void> {
    await this.connection.db.transaction(async (tx) => {
      const [stored] = await tx.insert(analysisCheckResults).values({
        analysisRunId: runId,
        checkType: result.checkType,
        status: result.status,
        measuredValue: result.measuredValue ?? null,
        expectedValue: result.expectedValue ?? null,
        messageCode: result.messageCode,
        messageParams: result.messageParams,
        details: result.details.slice(0, 4000),
        analyzerVersion: result.analyzerVersion,
      }).onConflictDoUpdate({
        target: [analysisCheckResults.analysisRunId, analysisCheckResults.checkType],
        set: {
          status: result.status,
          measuredValue: result.measuredValue ?? null,
          expectedValue: result.expectedValue ?? null,
          messageCode: result.messageCode,
          messageParams: result.messageParams,
          details: result.details.slice(0, 4000),
          analyzerVersion: result.analyzerVersion,
          createdAt: new Date(),
        },
      }).returning();
      await tx.delete(analysisEvidence).where(eq(analysisEvidence.analysisCheckResultId, stored.id));
      if (result.evidence?.length) {
        await tx.insert(analysisEvidence).values(result.evidence.slice(0, 2000).map((evidence: AnalysisEvidenceInput) => ({
          analysisCheckResultId: stored.id,
          timestamp: Math.max(0, evidence.timestamp),
          problemType: evidence.problemType,
          measuredValue: evidence.measuredValue,
          messageCode: evidence.messageCode,
          messageParams: evidence.messageParams,
          details: evidence.details.slice(0, 1000),
        })));
      }
    });
  }

  private conclusion(statuses: string[]): 'ACCEPT' | 'REJECT' | 'MANUAL_REVIEW' {
    if (statuses.includes('FAIL')) return 'REJECT';
    if (statuses.some((status) => status === 'WARNING' || status === 'ERROR' || status === 'SKIPPED')) return 'MANUAL_REVIEW';
    return 'ACCEPT';
  }
}

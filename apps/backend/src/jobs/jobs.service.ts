import { errorMessageCode, localizedException } from '../common/api-message';
import { BadRequestException, ConflictException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { DATABASE, DatabaseConnection } from '../database/database.module';
import { acceptanceProfileVersions, jobAutoAnalyses, jobs, Job, telegramJobNotifications, users } from '../database/schema';
import { VideoDownloaderService } from '../downloader/video-downloader.service';
import type { SessionUser } from '../auth/auth.models';
import { selectTelegramUser } from '../auth/telegram-identity';
import { accessDenied } from '../auth/session.guard';
import { ProfilesService } from '../analysis/profiles.service';
import { defaultJobSource, type JobSource } from './job-source';

import { normalizeCriteria } from '../analysis/profile-criteria';
import { isShortsUrl, metadataFailure, shortsUrlRejection, youtubeUrl, type PreflightResult } from '../downloader/video-preflight';
import { formatPreflightFailure } from '../downloader/preflight-message';

type Transaction = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];

interface JobOptions {
  autoAnalyze?: boolean;
  profileCode?: string;
}

interface TelegramOrigin {
  botId: string;
  telegramUserId: string;
  chatId: string;
  messageId: number;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private working = false;

  constructor(
    @Inject(DATABASE) private readonly connection: DatabaseConnection,
    private readonly downloader: VideoDownloaderService,
    private readonly profiles: ProfilesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connection.db.update(jobs).set({ status: 'QUEUED', startedAt: null })
      .where(eq(jobs.status, 'DOWNLOADING'));
    this.timer = setInterval(() => void this.processNext(), 1000);
    void this.processNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async create(sourceUrl: string, user: SessionUser, options: JobOptions = {}): Promise<Job> {
    const { job } = await this.connection.db.transaction(
      (tx) => this.insertJob(tx, sourceUrl, user.id, defaultJobSource, options),
      { isolationLevel: 'read committed' },
    );
    return job;
  }

  async createFromTelegram(sourceUrl: string, origin: TelegramOrigin, profileCode?: string) {
    return this.connection.db.transaction(async (tx) => {
      if (origin.chatId !== origin.telegramUserId) throw accessDenied();
      const [user] = await selectTelegramUser(tx, origin.telegramUserId).for('share', { of: users });
      const [current] = await selectTelegramUser(tx, origin.telegramUserId);
      if (!current?.isActive || current.id !== user?.id) throw accessDenied();
      const { rows: [video] } = await tx.execute<{ key: string }>(sql`SELECT job_video_key(${sourceUrl}) AS key`);
      if (sourceUrl.length > 2048 || !video?.key.startsWith('youtube:')) {
        throw localizedException(BadRequestException, 'Укажите ссылку на видео YouTube.', 'errors.telegramYouTubeOnly');
      }
      const videoId = video.key.slice('youtube:'.length);
      const canonicalUrl = isShortsUrl(sourceUrl)
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`;
      const result = await this.insertJob(tx, canonicalUrl, user.id, 'telegram', { autoAnalyze: true, profileCode });
      if (!result.profile) throw new Error('The automatic Telegram job has no profile.');
      await tx.insert(telegramJobNotifications).values({ videoId: result.job.id, ...origin });
      return { job: result.job, profile: result.profile };
    }, { isolationLevel: 'read committed' });
  }

  private async insertJob(tx: Transaction, sourceUrl: string, userId: string, source: JobSource, options: JobOptions) {
    const videoKey = sql`job_video_key(${sourceUrl})`;
    const storedVideoKey = sql`job_video_key(${jobs.sourceUrl})`;
    // Read the existing jobs after the lock, including any insert committed by the previous holder.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'jobs:' + userId}), hashtext(${videoKey}))`);
    const [existing] = await tx.select({ id: jobs.id }).from(jobs)
      .where(and(
        eq(jobs.createdByUserId, userId),
        sql`md5(${storedVideoKey}) = md5(${videoKey})`,
        sql`${storedVideoKey} = ${videoKey}`,
      ))
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
      .limit(1);
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'VIDEO_ALREADY_EXISTS',
        message: 'Видео уже добавлено',
        jobId: existing.id,
      });
    }

    const youtube = youtubeUrl(sourceUrl) !== null;
    const profile = youtube || options.autoAnalyze || options.profileCode !== undefined
      ? await this.profiles.resolveVersion(tx, options.profileCode)
      : undefined;
    const earlyRejection = youtube && profile && isShortsUrl(sourceUrl)
      ? shortsUrlRejection(sourceUrl, normalizeCriteria(profile.criteria))
      : undefined;
    const [job] = await tx.insert(jobs).values({
      sourceUrl, source, createdByUserId: userId,
      ...(youtube && profile ? { preflightProfileVersionId: profile.id } : {}),
      ...(earlyRejection ? this.preflightFailureValues(earlyRejection) : {}),
    }).returning();
    if (options.autoAnalyze && profile && !earlyRejection) {
      await tx.insert(jobAutoAnalyses).values({ videoId: job.id, profileVersionId: profile.id });
    }
    return { job, profile };
  }

  async list(user: SessionUser) {
    return this.selectWithCreator()
      .where(user.role === 'admin' ? undefined : eq(jobs.createdByUserId, user.id))
      .orderBy(desc(jobs.createdAt));
  }

  async get(id: string, user: SessionUser) {
    const [job] = await this.selectWithCreator().where(eq(jobs.id, id)).limit(1);
    if (job && user.role !== 'admin' && job.createdByUserId !== user.id) throw accessDenied();
    return job;
  }

  private selectWithCreator() {
    return this.connection.db.select({
      ...getTableColumns(jobs),
      createdBy: { id: users.id, username: users.login, displayName: users.displayName },
    }).from(jobs).leftJoin(users, eq(jobs.createdByUserId, users.id));
  }

  private async runPreflight(job: Job) {
    if (!job.preflightProfileVersionId) return { blocked: false };
    const { db } = this.connection;
    const [version] = await db.select({ criteria: acceptanceProfileVersions.criteria }).from(acceptanceProfileVersions)
      .where(eq(acceptanceProfileVersions.id, job.preflightProfileVersionId));
    if (!version) {
      await this.finishPreflightFailure(job.id, metadataFailure('Profile version missing'));
      return { blocked: true };
    }

    const criteria = normalizeCriteria(version.criteria);
    const { result, info } = await this.downloader.preflight(job.sourceUrl, criteria);
    const blocked = result.status !== 'PASSED' &&
      !(result.status === 'INCONCLUSIVE' && criteria.resolution.preflightInconclusive === 'download');
    if (blocked) await this.finishPreflightFailure(job.id, result);
    else await db.update(jobs).set({ preflight: result }).where(eq(jobs.id, job.id));
    return { blocked, info };
  }

  private preflightFailureValues(preflight: PreflightResult) {
    const errorCode = preflight.status === 'REJECTED' ? 'errors.preflightRejected'
      : preflight.status === 'INCONCLUSIVE' ? 'errors.preflightInconclusive' : 'errors.preflightMetadata';
    return { preflight, status: 'FAILED' as const, error: formatPreflightFailure(preflight, 'ru'), errorCode, completedAt: new Date() };
  }

  private async finishPreflightFailure(jobId: string, preflight: PreflightResult): Promise<void> {
    await this.connection.db.update(jobs).set(this.preflightFailureValues(preflight)).where(eq(jobs.id, jobId));
  }

  private async processNext(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      const [job] = await this.connection.db.select().from(jobs)
        .where(eq(jobs.status, 'QUEUED')).orderBy(asc(jobs.createdAt)).limit(1);
      if (!job) return;
      const [claimed] = await this.connection.db.update(jobs).set({ status: 'DOWNLOADING', startedAt: new Date(), error: null, errorCode: null })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, 'QUEUED'))).returning({ id: jobs.id });
      if (!claimed) return;
      try {
        const preflight = await this.runPreflight(job);
        if (preflight.blocked) return;
        const downloaded = await this.downloader.download(job.sourceUrl, preflight.info);
        await this.connection.db.update(jobs).set({
          status: 'DOWNLOADED', localPath: downloaded.path, title: downloaded.info.title ?? null,
          description: downloaded.info.description ?? null, completedAt: new Date(),
        }).where(eq(jobs.id, job.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось скачать видео.';
        await this.connection.db.update(jobs).set({ status: 'FAILED', error: message, errorCode: errorMessageCode(error, 'errors.downloadFailed'), completedAt: new Date() })
          .where(eq(jobs.id, job.id));
      }
    } finally {
      this.working = false;
    }
  }
}

import { errorMessageCode } from '../common/api-message';
import { ConflictException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { DATABASE, DatabaseConnection } from '../database/database.module';
import { jobAutoAnalyses, jobs, Job, users } from '../database/schema';
import { VideoDownloaderService } from '../downloader/video-downloader.service';
import type { SessionUser } from '../auth/auth.models';
import { accessDenied } from '../auth/session.guard';
import { ProfilesService } from '../analysis/profiles.service';
import { defaultJobSource } from './job-source';

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

  async create(sourceUrl: string, user: SessionUser, options: { autoAnalyze?: boolean; profileCode?: string } = {}): Promise<Job> {
    const videoKey = sql`job_video_key(${sourceUrl})`;
    const storedVideoKey = sql`job_video_key(${jobs.sourceUrl})`;
    return this.connection.db.transaction(async (tx) => {
      // Read the existing jobs after the lock, including any insert committed by the previous holder.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'jobs:' + user.id}), hashtext(${videoKey}))`);
      const [existing] = await tx.select({ id: jobs.id }).from(jobs)
        .where(and(
          eq(jobs.createdByUserId, user.id),
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

      const profileVersionId = options.autoAnalyze || options.profileCode !== undefined
        ? await this.profiles.resolveVersion(tx, options.profileCode)
        : undefined;
      const [job] = await tx.insert(jobs).values({
        sourceUrl,
        source: defaultJobSource,
        createdByUserId: user.id,
      }).returning();
      if (options.autoAnalyze && profileVersionId) {
        await tx.insert(jobAutoAnalyses).values({ videoId: job.id, profileVersionId });
      }
      return job;
    }, { isolationLevel: 'read committed' });
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

  private async processNext(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      const [job] = await this.connection.db.select().from(jobs)
        .where(eq(jobs.status, 'QUEUED')).orderBy(asc(jobs.createdAt)).limit(1);
      if (!job) return;
      await this.connection.db.update(jobs).set({ status: 'DOWNLOADING', startedAt: new Date(), error: null, errorCode: null })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, 'QUEUED')));
      try {
        const downloaded = await this.downloader.download(job.sourceUrl);
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

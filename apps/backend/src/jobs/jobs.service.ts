import { errorMessageCode } from '../common/api-message';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DATABASE, DatabaseConnection } from '../database/database.module';
import { jobs, Job } from '../database/schema';
import { VideoDownloaderService } from '../downloader/video-downloader.service';
import { defaultJobSource, type JobSource } from './job-source';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private working = false;

  constructor(
    @Inject(DATABASE) private readonly connection: DatabaseConnection,
    private readonly downloader: VideoDownloaderService,
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

  async create(sourceUrl: string, source: JobSource = defaultJobSource): Promise<Job> {
    const [job] = await this.connection.db.insert(jobs).values({ sourceUrl, source }).returning();
    return job;
  }

  async list(): Promise<Job[]> {
    return this.connection.db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async get(id: string): Promise<Job | undefined> {
    const [job] = await this.connection.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return job;
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

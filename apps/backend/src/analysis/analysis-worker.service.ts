import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { DATABASE, DatabaseConnection } from '../database/database.module';
import { analysisRuns } from '../database/schema';
import { ANALYSIS_QUEUE } from './analysis.constants';
import { AnalysisQueueService, analysisConcurrency, redisConnectionOptions } from './analysis-queue.service';
import { AnalysisService } from './analysis.service';

interface AnalysisJobData { runId: string }

@Injectable()
export class AnalysisWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisWorkerService.name);
  private autoAnalysisTimer?: ReturnType<typeof setInterval>;
  private dispatching = false;
  private worker?: Worker<AnalysisJobData>;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseConnection,
    private readonly analysis: AnalysisService,
    private readonly queue: AnalysisQueueService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<AnalysisJobData>(ANALYSIS_QUEUE, async (job) => {
      await this.analysis.execute(job.data.runId);
    }, {
      connection: redisConnectionOptions(),
      concurrency: analysisConcurrency(process.env.ANALYSIS_CONCURRENCY),
      lockDuration: 30 * 60 * 1000,
      stalledInterval: 60_000,
      maxStalledCount: 2,
    });
    this.worker.on('error', (error) => this.logger.error(`Analysis worker connection error: ${error.message}`));
    this.worker.on('failed', (job, error) => {
      if (!job || job.attemptsMade < Number(job.opts.attempts ?? 1)) return;
      void this.analysis.markFailed(job.data.runId, error).catch((dbError: unknown) => {
        const message = dbError instanceof Error ? dbError.message : 'Database update failed';
        this.logger.error(`Failed to persist analysis failure: ${message}`);
      });
    });
    this.autoAnalysisTimer = setInterval(() => void this.dispatchAutoAnalyses(), 1000);
    void this.dispatchAutoAnalyses();
    void this.recoverPendingRuns().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Queue recovery failed';
      this.logger.error(`Unable to recover pending analyses: ${message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.autoAnalysisTimer);
    await this.worker?.close();
  }

  private async dispatchAutoAnalyses(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      await this.analysis.dispatchPendingAutoAnalyses();
    } catch (error) {
      this.logger.error('Unable to dispatch automatic analysis', error);
    } finally {
      this.dispatching = false;
    }
  }

  private async recoverPendingRuns(): Promise<void> {
    await this.worker?.waitUntilReady();
    const pending = await this.database.db.select().from(analysisRuns)
      .where(inArray(analysisRuns.status, ['QUEUED', 'RUNNING']));
    for (const run of pending) {
      const existing = await this.queue.get(run.id);
      if (existing) {
        const state = await existing.getState();
        if (state === 'failed') {
          await this.analysis.markFailed(run.id, new Error(existing.failedReason || 'Очередь превысила число попыток.'));
        }
        continue;
      }
      if (run.status === 'RUNNING') {
        await this.database.db.update(analysisRuns).set({ status: 'QUEUED', startedAt: null })
          .where(and(eq(analysisRuns.id, run.id), eq(analysisRuns.status, 'RUNNING')));
      }
      await this.queue.enqueue(run.id);
    }
  }
}

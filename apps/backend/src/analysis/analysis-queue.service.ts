import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConnectionOptions, Job, Queue } from 'bullmq';
import { ANALYSIS_QUEUE } from './analysis.constants';

interface AnalysisJobData { runId: string }

@Injectable()
export class AnalysisQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalysisQueueService.name);
  private readonly queue: Queue<AnalysisJobData>;

  constructor() {
    this.queue = new Queue<AnalysisJobData>(ANALYSIS_QUEUE, {
      connection: redisConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 5000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 10000 },
      },
    });
    this.queue.on('error', (error) => this.logger.error(`Analysis queue connection error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async enqueue(runId: string): Promise<void> {
    await this.queue.add('analyze-video', { runId }, { jobId: runId });
  }

  get(runId: string): Promise<Job<AnalysisJobData, unknown, string> | undefined> {
    return this.queue.getJob(runId);
  }
}

export function redisConnectionOptions(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const databaseIndex = Number(url.pathname.slice(1) || 0);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isInteger(databaseIndex) ? databaseIndex : 0,
    maxRetriesPerRequest: null,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function analysisConcurrency(value: string | undefined): number {
  const concurrency = Number(value ?? 1);
  return Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 4 ? concurrency : 1;
}

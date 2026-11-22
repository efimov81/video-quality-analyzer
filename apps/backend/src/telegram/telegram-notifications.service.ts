import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { AnalysisService } from '../analysis/analysis.service';
import { selectTelegramUser } from '../auth/telegram-identity';
import { DATABASE, type DatabaseConnection } from '../database/database.module';
import { analysisRuns, jobAutoAnalyses, jobs, telegramJobNotifications, telegramPreferences } from '../database/schema';
import { type TelegramApi, TelegramApiError } from './telegram-api';
import { telegramMessages } from './telegram-messages';
import { formatPreflightFailure } from '../downloader/preflight-message';
import { formatTelegramReport } from './telegram-report';

type Notification = typeof telegramJobNotifications.$inferSelect;

@Injectable()
export class TelegramNotificationsService {
  private readonly logger = new Logger(TelegramNotificationsService.name);

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseConnection,
    private readonly analysis: AnalysisService,
  ) {}

  async recover(botId: string): Promise<void> {
    await this.database.db.update(telegramJobNotifications).set({ state: 'uncertain' })
      .where(and(eq(telegramJobNotifications.botId, botId), eq(telegramJobNotifications.state, 'sending')));
  }

  async deliverReady(botId: string, api: Pick<TelegramApi, 'sendMessage' | 'sendReport'>, signal: AbortSignal): Promise<void> {
    const { db } = this.database;
    const ready = await db.select({
      notification: telegramJobNotifications,
      video: jobs,
      run: analysisRuns,
      language: telegramPreferences.language,
    }).from(telegramJobNotifications)
      .innerJoin(jobs, eq(jobs.id, telegramJobNotifications.videoId))
      .leftJoin(jobAutoAnalyses, eq(jobAutoAnalyses.videoId, jobs.id))
      .leftJoin(analysisRuns, eq(analysisRuns.id, jobAutoAnalyses.runId))
      .leftJoin(telegramPreferences, eq(telegramPreferences.telegramUserId, telegramJobNotifications.telegramUserId))
      .where(and(
        eq(telegramJobNotifications.botId, botId),
        eq(telegramJobNotifications.state, 'pending'),
        lte(telegramJobNotifications.retryAt, sql`now()`),
        or(eq(jobs.status, 'FAILED'), inArray(analysisRuns.status, ['COMPLETED', 'FAILED'])),
      ))
      .orderBy(asc(telegramJobNotifications.retryAt), asc(telegramJobNotifications.videoId))
      .limit(20);

    for (const { notification, video, run, language } of ready) {
      if (signal.aborted) return;
      const [user] = await selectTelegramUser(db, notification.telegramUserId);
      if (!user?.isActive || user.id !== video.createdByUserId || notification.chatId !== notification.telegramUserId) {
        await this.setState(notification.videoId, 'pending', { state: 'skipped' });
        continue;
      }

      const locale = language ?? 'en';
      const messages = telegramMessages[locale];
      const summary = video.preflight && video.status === 'FAILED' && video.errorCode?.startsWith('errors.preflight')
        ? formatPreflightFailure(video.preflight, locale)
        : video.status === 'FAILED' ? messages.downloadFailed : messages.analysisFailed;
      const report = run?.status === 'COMPLETED'
        ? formatTelegramReport(await this.analysis.report(run.id, { ...user, role: 'user' }), locale)
        : null;
      if (signal.aborted) return;
      const claimed = await this.setState(notification.videoId, 'pending', { state: 'sending' });
      if (!claimed) continue;

      try {
        if (report) {
          await api.sendReport(notification.chatId, notification.messageId, report.caption, report.document, signal);
        } else {
          await api.sendMessage(notification.chatId, notification.messageId, `${summary}\n${video.sourceUrl}`, signal);
        }
      } catch (error) {
        await this.handleFailure(notification.videoId, error);
        continue;
      }
      await this.setState(notification.videoId, 'sending', { state: 'sent' });
    }
  }

  private async handleFailure(videoId: string, error: unknown): Promise<void> {
    const status = error instanceof TelegramApiError ? error.status : undefined;
    if (status === 429 || (status !== undefined && status >= 500)) {
      const delay = (error as TelegramApiError).retryAfter ?? 30;
      await this.setState(videoId, 'sending', { state: 'pending', retryAt: new Date(Date.now() + delay * 1000) });
    } else {
      await this.setState(videoId, 'sending', { state: status ? 'failed' : 'uncertain' });
      this.logger.warn(`Telegram notification for job ${videoId} was not confirmed${status ? ` (HTTP ${status})` : ''}.`);
    }
  }

  private async setState(videoId: string, from: Notification['state'], values: Pick<Notification, 'state'> & { retryAt?: Date }) {
    const [updated] = await this.database.db.update(telegramJobNotifications).set(values)
      .where(and(eq(telegramJobNotifications.videoId, videoId), eq(telegramJobNotifications.state, from)))
      .returning({ videoId: telegramJobNotifications.videoId });
    return updated;
  }
}

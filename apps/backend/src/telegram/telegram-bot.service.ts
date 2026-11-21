import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { DATABASE, type DatabaseConnection } from '../database/database.module';
import { TelegramApi, TelegramApiError } from './telegram-api';
import { TelegramCommandsService } from './telegram-commands.service';
import { TelegramNotificationsService } from './telegram-notifications.service';

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  try {
    await sleep(ms, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly shutdown = new AbortController();
  private running?: Promise<void>;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseConnection,
    private readonly commands: TelegramCommandsService,
    private readonly notifications: TelegramNotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return;
    if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) {
      this.logger.warn('Telegram polling is disabled because TELEGRAM_BOT_TOKEN has an invalid format.');
      return;
    }
    this.running = this.run(token.split(':', 1)[0], new TelegramApi(token), this.shutdown.signal);
  }

  async onModuleDestroy(): Promise<void> {
    this.shutdown.abort();
    await this.running;
  }

  private async run(botId: string, api: TelegramApi, shutdown: AbortSignal): Promise<void> {
    while (!shutdown.aborted) {
      try {
        await this.runWithLock(botId, api, shutdown);
      } catch (error) {
        if (!shutdown.aborted) this.warn('Unable to start Telegram polling', error);
      }
      await delay(5000, shutdown);
    }
  }

  private async runWithLock(botId: string, api: TelegramApi, shutdown: AbortSignal): Promise<void> {
    const client = await this.database.pool.connect();
    const lost = new AbortController();
    const disconnected = () => lost.abort();
    client.on('error', disconnected);
    let locked = false;
    try {
      const { rows: [lock] } = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
        [`vqa:telegram-poll:${botId}`],
      );
      locked = lock.acquired;
      if (!locked || shutdown.aborted) return;

      const signal = AbortSignal.any([lost.signal, shutdown]);
      const { username } = await api.identity(signal);
      await this.notifications.recover(botId);
      this.logger.log('Telegram long polling is active.');
      await Promise.all([this.poll(botId, username, api, signal), this.notify(botId, api, signal)]);
    } finally {
      client.removeListener('error', disconnected);
      client.release(locked || lost.signal.aborted);
    }
  }

  private async poll(botId: string, username: string, api: TelegramApi, signal: AbortSignal): Promise<void> {
    let offset: number | undefined;
    while (!signal.aborted) {
      try {
        const updates = await api.updates(offset, signal);
        if (!updates.length) offset = undefined;
        for (const update of updates) {
          if (signal.aborted) return;
          if (update.message) {
            try {
              await this.commands.handle(update.message, { botId, username, api, signal });
            } catch (error) {
              if (!(error instanceof TelegramApiError)) throw error;
              if (!signal.aborted) this.warn('Telegram command reply failed', error);
            }
          }
          offset = update.update_id + 1;
        }
      } catch (error) {
        if (!signal.aborted) this.warn('Telegram polling request failed', error);
        const retryAfter = error instanceof TelegramApiError ? error.retryAfter : undefined;
        await delay(Math.max(3, retryAfter ?? 0) * 1000, signal);
      }
    }
  }

  private async notify(botId: string, api: TelegramApi, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.notifications.deliverReady(botId, api, signal);
      } catch (error) {
        if (!signal.aborted) this.warn('Telegram notification scan failed', error);
      }
      await delay(3000, signal);
    }
  }

  private warn(message: string, error: unknown): void {
    const status = error instanceof TelegramApiError && error.status;
    this.logger.warn(status ? `${message} (HTTP ${status}).` : `${message}.`);
  }
}

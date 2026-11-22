import { HttpException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ProfilesService } from '../analysis/profiles.service';
import { selectTelegramUser } from '../auth/telegram-identity';
import { errorMessageCode } from '../common/api-message';
import { DATABASE, type DatabaseConnection } from '../database/database.module';
import { telegramPreferences } from '../database/schema';
import { JobsService } from '../jobs/jobs.service';
import type { TelegramApi, TelegramMessage } from './telegram-api';
import { initialTelegramLanguage, telegramMessages, type TelegramLanguage } from './telegram-messages';

interface ReplyContext {
  botId: string;
  username: string;
  api: Pick<TelegramApi, 'sendMessage'>;
  signal: AbortSignal;
}

@Injectable()
export class TelegramCommandsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseConnection,
    private readonly jobs: JobsService,
    private readonly profiles: ProfilesService,
  ) {}

  async handle(message: TelegramMessage, context: ReplyContext): Promise<void> {
    const sender = message.from;
    const text = message.text?.trim();
    if (!sender || sender.is_bot || !Number.isSafeInteger(sender.id) || sender.id <= 0 ||
      !Number.isSafeInteger(message.chat.id) || !Number.isInteger(message.message_id) || !text) return;

    const [command, ...args] = text.split(/\s+/);
    const [action, mention] = command.split('@', 2);
    if (message.chat.type !== 'private' && !action.startsWith('/')) return;
    if (action.startsWith('/') && mention && mention.toLowerCase() !== context.username.toLowerCase()) return;
    const externalId = String(sender.id);
    const chatId = String(message.chat.id);
    const reply = (body: string) => context.api.sendMessage(chatId, message.message_id, body, context.signal);
    const language = await this.language(externalId, sender.language_code);
    const messages = telegramMessages[language];

    if (action === '/id') {
      await reply(`${messages.id}: ${externalId}`);
      return;
    }
    if (action === '/lang') {
      if (args.length === 1 && (args[0] === 'en' || args[0] === 'ru')) {
        await this.database.db.update(telegramPreferences).set({ language: args[0] })
          .where(eq(telegramPreferences.telegramUserId, externalId));
        await reply(telegramMessages[args[0]].languageSaved);
      } else await reply(messages.currentLanguage);
      return;
    }
    if (message.chat.type !== 'private' || chatId !== externalId) {
      await reply(action === '/start' ? `${messages.welcome}\n${messages.linkAccount}` : messages.privateChat);
      return;
    }

    const [user] = await selectTelegramUser(this.database.db, externalId);
    const accountStatus = user ? (user.isActive ? messages.accountActive : messages.accountInactive) : messages.linkAccount;
    if (action === '/start') {
      await reply(`${messages.welcome}\n${accountStatus}`);
    } else if (!user?.isActive) {
      await reply(accountStatus);
    } else if (action === '/help') {
      await reply(messages.help);
    } else if (action === '/profiles') {
      for (const line of await this.profileMessages(language)) await reply(line);
    } else {
      const input = action === '/analyze' ? args : text === command && /^https?:\/\//i.test(command) ? [command] : [];
      if (input.length === 0 || input.length > 2) {
        await reply(messages.syntax);
        return;
      }
      const origin = { botId: context.botId, chatId, telegramUserId: externalId, messageId: message.message_id };
      const response = await this.analyze(input.at(-1)!, input.length === 2 ? input[0] : undefined, origin, language);
      if (response) await reply(response);
    }
  }

  private async language(externalId: string, languageCode?: string): Promise<TelegramLanguage> {
    const { db } = this.database;
    const lookup = () => db.select({ language: telegramPreferences.language }).from(telegramPreferences)
      .where(eq(telegramPreferences.telegramUserId, externalId));
    const [existing] = await lookup();
    if (existing) return existing.language;
    const language = initialTelegramLanguage(languageCode);
    const [created] = await db.insert(telegramPreferences).values({ telegramUserId: externalId, language })
      .onConflictDoNothing().returning({ language: telegramPreferences.language });
    return created?.language ?? (await lookup())[0]?.language ?? language;
  }

  private async profileMessages(language: TelegramLanguage): Promise<string[]> {
    const messages = telegramMessages[language];
    const profiles = (await this.profiles.list()).filter((profile) => profile.isActive);
    if (!profiles.length) return [messages.noProfiles];

    const chunks: string[] = [];
    let chunk: string = messages.profiles;
    for (const profile of profiles) {
      const line = `${profile.code} — ${profile.name}${profile.isDefault ? ` (${messages.default})` : ''}`;
      if (chunk.length + line.length + 1 > 4000) {
        chunks.push(chunk);
        chunk = line;
      } else chunk += `\n${line}`;
    }
    chunks.push(chunk);
    return chunks;
  }

  private async analyze(
    sourceUrl: string,
    profileCode: string | undefined,
    origin: Parameters<JobsService['createFromTelegram']>[1],
    language: TelegramLanguage,
  ): Promise<string | undefined> {
    const messages = telegramMessages[language];
    try {
      const { job, profile } = await this.jobs.createFromTelegram(sourceUrl, origin, profileCode);
      if (job.preflight?.status === 'REJECTED') return undefined;
      return `${messages.accepted}: ${job.id}\n${messages.profile}: ${profile.name} (${profile.code}), ${messages.version} ${profile.version}`;
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      const response = error.getResponse();
      if (typeof response === 'object' && 'code' in response && response.code === 'VIDEO_ALREADY_EXISTS' &&
        'jobId' in response && typeof response.jobId === 'string') return `${messages.duplicate}: ${response.jobId}`;
      switch (errorMessageCode(error, '')) {
        case 'errors.telegramYouTubeOnly': return messages.youtubeOnly;
        case 'errors.profileNotFound': return messages.profileNotFound;
        case 'errors.profileInactive': return messages.profileInactive;
        case 'errors.defaultProfileMissing': return messages.defaultProfileMissing;
        case 'errors.accessDenied': return messages.linkAccount;
        default: return messages.unexpected;
      }
    }
  }
}

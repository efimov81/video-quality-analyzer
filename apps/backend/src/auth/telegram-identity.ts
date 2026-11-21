import { and, eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../database/database.module';
import { externalIdentities, users } from '../database/schema';
import { sessionUserFields } from './auth.service';

export const telegramIdPattern = /^[1-9][0-9]{0,15}$/;

export function selectTelegramUser(db: Pick<DatabaseConnection['db'], 'select'>, telegramUserId: string) {
  return db.select(sessionUserFields).from(externalIdentities)
    .innerJoin(users, eq(users.id, externalIdentities.userId))
    .where(and(eq(externalIdentities.provider, 'telegram'), eq(externalIdentities.externalUserId, telegramUserId)));
}

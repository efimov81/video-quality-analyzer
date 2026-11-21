import { ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { localizedException } from '../common/api-message';
import type { DatabaseConnection } from '../database/database.module';
import { externalIdentities, users } from '../database/schema';

export async function resolveExternalUser(
  db: Pick<DatabaseConnection['db'], 'select'>,
  provider: string,
  externalUserId: string | undefined,
): Promise<string | null> {
  if (externalUserId === undefined) return null;

  const [user] = await db.select({ id: users.id })
    .from(externalIdentities)
    .innerJoin(users, eq(externalIdentities.userId, users.id))
    .where(and(
      eq(externalIdentities.provider, provider),
      eq(externalIdentities.externalUserId, externalUserId),
      eq(users.isActive, true),
    ))
    .limit(1);

  if (!user) {
    throw localizedException(ForbiddenException, 'Активный пользователь не найден.', 'errors.externalUserUnavailable');
  }
  return user.id;
}

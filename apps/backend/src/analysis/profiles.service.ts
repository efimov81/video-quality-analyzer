import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { localizedException } from '../common/api-message';
import { DATABASE, DatabaseConnection } from '../database/database.module';
import { acceptanceProfileVersions, acceptanceProfiles } from '../database/schema';
import { normalizeCriteria } from './profile-criteria';

export const profileCodePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface SaveProfileInput {
  name: string;
  description?: string;
  code?: string;
  isActive?: boolean;
  isDefault?: boolean;
  criteria: unknown;
}

type Transaction = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
const profileNotFound = () => localizedException(NotFoundException, 'Профиль не найден.', 'errors.profileNotFound');
const inactiveProfile = () => localizedException(BadRequestException, 'Выбранный профиль не активен.', 'errors.profileInactive');

@Injectable()
export class ProfilesService {
  constructor(@Inject(DATABASE) private readonly connection: DatabaseConnection) {}

  list() {
    return this.connection.db.select().from(acceptanceProfiles).orderBy(asc(acceptanceProfiles.name));
  }

  async get(id: string) {
    return this.findBy(eq(acceptanceProfiles.id, id));
  }

  async getByCode(code: string) {
    return this.findBy(eq(acceptanceProfiles.code, code));
  }

  private async findBy(condition: ReturnType<typeof eq>) {
    const [profile] = await this.connection.db.select().from(acceptanceProfiles).where(condition).limit(1);
    if (!profile) throw profileNotFound();
    return profile;
  }

  async resolveVersion(tx: Transaction, code?: string) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtext('vqa:acceptance-profiles'))`);
    const [profile] = await tx.select().from(acceptanceProfiles)
      .where(code === undefined ? eq(acceptanceProfiles.isDefault, true) : eq(acceptanceProfiles.code, code))
      .limit(1).for('share');
    if (!profile) {
      if (code !== undefined) throw profileNotFound();
      throw localizedException(BadRequestException, 'Активный профиль по умолчанию не настроен.', 'errors.defaultProfileMissing');
    }
    if (!profile.isActive) throw inactiveProfile();
    const [version] = await tx.select({ id: acceptanceProfileVersions.id }).from(acceptanceProfileVersions)
      .where(and(eq(acceptanceProfileVersions.profileId, profile.id), eq(acceptanceProfileVersions.version, profile.version)))
      .limit(1);
    if (!version) throw profileNotFound();
    return { id: version.id, code: profile.code, name: profile.name, version: profile.version };
  }

  create(input: SaveProfileInput) {
    return this.save(input);
  }

  update(id: string, input: SaveProfileInput) {
    return this.save(input, id);
  }

  private async save(input: SaveProfileInput, id?: string) {
    this.validateName(input.name);
    const criteria = normalizeCriteria(input.criteria);
    return this.connection.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('vqa:acceptance-profiles'))`);
      const [current] = id
        ? await tx.select().from(acceptanceProfiles).where(eq(acceptanceProfiles.id, id)).for('update').limit(1)
        : [];
      if (id && !current) throw profileNotFound();
      const isActive = input.isActive ?? current?.isActive ?? true;
      if (!isActive && input.isDefault) throw inactiveProfile();
      const isDefault = isActive && (input.isDefault ?? current?.isDefault ?? false);
      const code = input.code ?? current?.code ?? `profile-${randomUUID()}`;
      const [duplicate] = await tx.select({ id: acceptanceProfiles.id }).from(acceptanceProfiles)
        .where(eq(acceptanceProfiles.code, code));
      if (duplicate && duplicate.id !== id) {
        throw localizedException(ConflictException, 'Этот код профиля уже используется.', 'errors.profileCodeTaken');
      }
      if (isDefault && !current?.isDefault) {
        await tx.update(acceptanceProfiles).set({ isDefault: false, updatedAt: new Date() })
          .where(eq(acceptanceProfiles.isDefault, true));
      }
      const values = { name: input.name.trim(), description: input.description?.trim() ?? '', code, isActive, isDefault, criteria };
      const [profile] = current
        ? await tx.update(acceptanceProfiles).set({ ...values, version: current.version + 1, updatedAt: new Date() })
          .where(eq(acceptanceProfiles.id, current.id)).returning()
        : await tx.insert(acceptanceProfiles).values(values).returning();
      await tx.insert(acceptanceProfileVersions).values({
        profileId: profile.id,
        version: profile.version,
        name: profile.name,
        description: profile.description,
        isActive: profile.isActive,
        criteria,
      });
      return profile;
    });
  }

  async versions(id: string) {
    await this.get(id);
    return this.connection.db.select().from(acceptanceProfileVersions)
      .where(eq(acceptanceProfileVersions.profileId, id)).orderBy(asc(acceptanceProfileVersions.version));
  }

  private validateName(name: string): void {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
      throw localizedException(BadRequestException, 'Название профиля обязательно и не должно превышать 120 символов.', 'errors.profileName', { limit: 120 });
    }
  }
}

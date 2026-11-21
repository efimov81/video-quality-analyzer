import { localizedException } from '../common/api-message';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE, DatabaseConnection } from '../database/database.module';
import { acceptanceProfileVersions, acceptanceProfiles } from '../database/schema';
import { normalizeCriteria } from './profile-criteria';

export interface SaveProfileInput {
  name: string;
  description?: string;
  isActive?: boolean;
  criteria: unknown;
}

@Injectable()
export class ProfilesService {
  constructor(@Inject(DATABASE) private readonly connection: DatabaseConnection) {}

  list() {
    return this.connection.db.select().from(acceptanceProfiles).orderBy(asc(acceptanceProfiles.name));
  }

  async get(id: string) {
    const [profile] = await this.connection.db.select().from(acceptanceProfiles).where(eq(acceptanceProfiles.id, id)).limit(1);
    if (!profile) throw localizedException(NotFoundException, 'Профиль не найден.', 'errors.profileNotFound');
    return profile;
  }

  async create(input: SaveProfileInput) {
    this.validateName(input.name);
    const criteria = normalizeCriteria(input.criteria);
    return this.connection.db.transaction(async (tx) => {
      const [profile] = await tx.insert(acceptanceProfiles).values({
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        isActive: input.isActive ?? true,
        criteria,
      }).returning();
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

  async update(id: string, input: SaveProfileInput) {
    this.validateName(input.name);
    const criteria = normalizeCriteria(input.criteria);
    return this.connection.db.transaction(async (tx) => {
      const [current] = await tx.select().from(acceptanceProfiles).where(eq(acceptanceProfiles.id, id)).for('update').limit(1);
      if (!current) throw localizedException(NotFoundException, 'Профиль не найден.', 'errors.profileNotFound');
      const [profile] = await tx.update(acceptanceProfiles).set({
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        isActive: input.isActive ?? current.isActive,
        criteria,
        version: current.version + 1,
        updatedAt: new Date(),
      }).where(eq(acceptanceProfiles.id, id)).returning();
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

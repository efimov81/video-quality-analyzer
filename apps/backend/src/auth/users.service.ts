import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { localizedException } from '../common/api-message';
import { DATABASE, type DatabaseConnection } from '../database/database.module';
import { sessions, users } from '../database/schema';
import type { CreateUserDto, UpdateUserDto } from './auth.dto';
import { sessionUserFields } from './auth.service';
import { hashPassword } from './password';

const userNotFound = () => localizedException(NotFoundException, 'Пользователь не найден.', 'errors.userNotFound');

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE) private readonly connection: DatabaseConnection) {}

  list() {
    return this.connection.db.select(sessionUserFields).from(users).orderBy(asc(users.login), asc(users.displayName));
  }

  async create(body: CreateUserDto) {
    const passwordHash = await hashPassword(body.password);
    const [user] = await this.connection.db.insert(users).values({
      login: body.login,
      displayName: body.displayName.trim(),
      role: body.role,
      passwordHash,
      mustChangePassword: true,
    }).onConflictDoNothing({ target: users.login }).returning(sessionUserFields);
    if (!user) throw localizedException(ConflictException, 'Логин уже используется.', 'errors.loginTaken');
    return user;
  }

  async update(id: string, body: UpdateUserDto) {
    return this.connection.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('vqa:active-admins'))`);
      const [current] = await tx.select(sessionUserFields).from(users).where(eq(users.id, id)).for('update');
      if (!current) throw userNotFound();

      const role = body.role ?? current.role;
      const isActive = body.isActive ?? current.isActive;
      if (role === 'admin' && !current.login) {
        throw localizedException(BadRequestException, 'У пользователя нет веб-логина.', 'errors.userHasNoLogin');
      }
      if (current.role === 'admin' && current.isActive && (role !== 'admin' || !isActive)) {
        const [other] = await tx.select({ id: users.id }).from(users)
          .where(and(eq(users.role, 'admin'), eq(users.isActive, true), ne(users.id, id))).limit(1);
        if (!other) throw localizedException(ConflictException, 'Нельзя отключить последнего активного администратора.', 'errors.lastAdmin');
      }

      const [user] = await tx.update(users).set({
        displayName: body.displayName?.trim(),
        role,
        isActive,
        updatedAt: new Date(),
      }).where(eq(users.id, id)).returning(sessionUserFields);
      if (!isActive) await tx.delete(sessions).where(eq(sessions.userId, id));
      return user;
    });
  }

  async resetPassword(id: string, adminId: string, password: string) {
    if (id === adminId) {
      throw localizedException(BadRequestException, 'Смените свой пароль в профиле.', 'errors.useOwnProfile');
    }
    const passwordHash = await hashPassword(password);
    await this.connection.db.transaction(async (tx) => {
      const [user] = await tx.update(users).set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, id)).returning({ login: users.login });
      if (!user) throw userNotFound();
      if (!user.login) {
        throw localizedException(BadRequestException, 'У пользователя нет веб-логина.', 'errors.userHasNoLogin');
      }
      await tx.delete(sessions).where(eq(sessions.userId, id));
    });
  }
}

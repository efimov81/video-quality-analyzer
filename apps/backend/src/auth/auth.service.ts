import {
  BadRequestException, Inject, Injectable, OnModuleInit, UnauthorizedException,
} from '@nestjs/common';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { localizedException } from '../common/api-message';
import { DATABASE, type DatabaseConnection } from '../database/database.module';
import { authInitialization, sessions, users } from '../database/schema';
import type { ChangePasswordDto, LoginDto } from './auth.dto';
import { hashPassword, verifyPassword } from './password';

export const sessionLifetimeMs = 12 * 60 * 60 * 1000;
export const sessionUserFields = {
  id: users.id,
  login: users.login,
  displayName: users.displayName,
  role: users.role,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
};

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const invalidCredentials = () => localizedException(UnauthorizedException, 'Неверный логин или пароль.', 'errors.invalidCredentials');

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(@Inject(DATABASE) private readonly connection: DatabaseConnection) {}

  async onModuleInit(): Promise<void> {
    await this.connection.db.transaction(async (tx) => {
      const [initialization] = await tx.insert(authInitialization).values({ id: 1 })
        .onConflictDoNothing().returning();
      if (!initialization) return;

      const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
      if (existing) return;

      await tx.insert(users).values({
        login: 'admin',
        displayName: 'Administrator',
        role: 'admin',
        passwordHash: await hashPassword('admin'),
        mustChangePassword: true,
      });
    });
  }

  async login(body: LoginDto) {
    const { db } = this.connection;
    const [candidate] = await db.select({ id: users.id, hash: users.passwordHash })
      .from(users).where(eq(users.login, body.login.toLowerCase()));
    if (!await verifyPassword(body.password, candidate?.hash) || !candidate?.hash) throw invalidCredentials();

    const token = randomBytes(32).toString('base64url');
    const user = await db.transaction(async (tx) => {
      const [current] = await tx.select(sessionUserFields).from(users)
        .where(and(eq(users.id, candidate.id), eq(users.passwordHash, candidate.hash!), eq(users.isActive, true)))
        .for('update');
      if (!current) throw invalidCredentials();

      await tx.delete(sessions).where(lte(sessions.expiresAt, sql`now()`));
      await tx.insert(sessions).values({
        tokenHash: tokenHash(token),
        userId: current.id,
        expiresAt: new Date(Date.now() + sessionLifetimeMs),
      });
      return current;
    });
    return { token, user };
  }

  async currentUser(token: string) {
    const [user] = await this.connection.db.select(sessionUserFields).from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, sql`now()`), eq(users.isActive, true)));
    return user;
  }

  async logout(token: string): Promise<void> {
    await this.connection.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
  }

  async changePassword(userId: string, token: string, body: ChangePasswordDto) {
    const { db } = this.connection;
    const [current] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
    if (!await verifyPassword(body.currentPassword, current?.hash) || !current?.hash) {
      throw localizedException(BadRequestException, 'Неверный текущий пароль.', 'errors.invalidCurrentPassword');
    }
    if (body.password === body.currentPassword) {
      throw localizedException(BadRequestException, 'Выберите другой пароль.', 'errors.passwordUnchanged');
    }

    const previousHash = current.hash;
    const passwordHash = await hashPassword(body.password);
    return db.transaction(async (tx) => {
      const [user] = await tx.update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.passwordHash, previousHash), eq(users.isActive, true)))
        .returning(sessionUserFields);
      if (!user) throw invalidCredentials();

      const currentTokenHash = tokenHash(token);
      await tx.delete(sessions).where(and(eq(sessions.userId, userId), sql`${sessions.tokenHash} <> ${currentTokenHash}`));
      return user;
    });
  }
}

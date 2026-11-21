import { sql } from 'drizzle-orm';
import type { UserRole } from '../auth/auth.models';
import type { MessageParams } from '../common/api-message';
import { defaultJobSource, type JobSource } from '../jobs/job-source';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const jobStatus = pgEnum('job_status', ['QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'FAILED']);
export const analysisRunStatus = pgEnum('analysis_run_status', ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']);
export const checkStatus = pgEnum('check_status', ['PASS', 'FAIL', 'WARNING', 'ERROR', 'SKIPPED']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  login: text('login'),
  passwordHash: text('password_hash'),
  role: text('role').$type<UserRole>().default('user').notNull(),
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('users_login_unique').on(table.login)]);

export const authInitialization = pgTable('auth_initialization', {
  id: integer('id').primaryKey(),
});

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('sessions_user_idx').on(table.userId),
  index('sessions_expiry_idx').on(table.expiresAt),
]);

export const externalIdentities = pgTable('external_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(),
  externalUserId: text('external_user_id').notNull(),
}, (table) => [
  uniqueIndex('external_identities_provider_user_unique').on(table.provider, table.externalUserId),
  index('external_identities_user_idx').on(table.userId),
]);

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceUrl: text('source_url').notNull(),
  source: text('source').$type<JobSource>().notNull().default(defaultJobSource),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  title: text('title'),
  description: text('description'),
  localPath: text('local_path'),
  status: jobStatus('status').default('QUEUED').notNull(),
  error: text('error'),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('jobs_created_by_user_idx').on(table.createdByUserId),
  index('jobs_creator_video_idx').on(table.createdByUserId, sql`md5(job_video_key("source_url"))`),
]);

export const acceptanceProfiles = pgTable('acceptance_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  criteria: jsonb('criteria').notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('acceptance_profiles_code_unique').on(table.code),
  uniqueIndex('acceptance_profiles_default_unique').on(table.isDefault).where(sql`${table.isDefault}`),
  check('acceptance_profiles_default_active', sql`not ${table.isDefault} or ${table.isActive}`),
]);

export const acceptanceProfileVersions = pgTable('acceptance_profile_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => acceptanceProfiles.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isActive: boolean('is_active').notNull(),
  criteria: jsonb('criteria').notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('acceptance_profile_version_unique').on(table.profileId, table.version)]);

export const analysisRuns = pgTable('analysis_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  videoId: uuid('video_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  profileId: uuid('profile_id').notNull().references(() => acceptanceProfiles.id, { onDelete: 'restrict' }),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
  profileVersion: integer('profile_version').notNull(),
  profileSnapshot: jsonb('profile_snapshot').notNull().$type<Record<string, unknown>>(),
  status: analysisRunStatus('status').notNull().default('QUEUED'),
  error: text('error'),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('analysis_runs_video_created_idx').on(table.videoId, table.createdAt),
  index('analysis_runs_requested_by_user_idx').on(table.requestedByUserId),
  index('analysis_runs_status_idx').on(table.status),
]);

export const jobAutoAnalyses = pgTable('job_auto_analyses', {
  videoId: uuid('video_id').primaryKey().references(() => jobs.id, { onDelete: 'cascade' }),
  profileVersionId: uuid('profile_version_id').notNull().references(() => acceptanceProfileVersions.id),
  runId: uuid('run_id').references(() => analysisRuns.id),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
}, (table) => [
  index('job_auto_analyses_pending_idx').on(table.videoId).where(sql`${table.dispatchedAt} IS NULL`),
]);

export const telegramPreferences = pgTable('telegram_preferences', {
  telegramUserId: text('telegram_user_id').primaryKey(),
  language: text('language').$type<'en' | 'ru'>().notNull(),
});

export const telegramJobNotifications = pgTable('telegram_job_notifications', {
  videoId: uuid('video_id').primaryKey().references(() => jobs.id, { onDelete: 'cascade' }),
  botId: text('bot_id').notNull(),
  telegramUserId: text('telegram_user_id').notNull(),
  chatId: text('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  state: text('state').$type<'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'uncertain'>().notNull().default('pending'),
  retryAt: timestamp('retry_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('telegram_notification_message_unique').on(table.botId, table.chatId, table.messageId),
  index('telegram_notifications_pending_idx').on(table.botId, table.retryAt).where(sql`${table.state} = 'pending'`),
]);

export const analysisCheckResults = pgTable('analysis_check_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  analysisRunId: uuid('analysis_run_id').notNull().references(() => analysisRuns.id, { onDelete: 'cascade' }),
  checkType: text('check_type').notNull(),
  status: checkStatus('status').notNull(),
  measuredValue: jsonb('measured_value'),
  expectedValue: jsonb('expected_value'),
  details: text('details').notNull(),
  messageCode: text('message_code'),
  messageParams: jsonb('message_params').$type<MessageParams>(),
  analyzerVersion: text('analyzer_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('analysis_check_result_unique').on(table.analysisRunId, table.checkType),
  index('analysis_check_run_idx').on(table.analysisRunId),
]);

export const analysisEvidence = pgTable('analysis_evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  analysisCheckResultId: uuid('analysis_check_result_id').notNull().references(() => analysisCheckResults.id, { onDelete: 'cascade' }),
  timestamp: doublePrecision('timestamp').notNull(),
  problemType: text('problem_type').notNull(),
  measuredValue: jsonb('measured_value'),
  details: text('details').notNull(),
  messageCode: text('message_code'),
  messageParams: jsonb('message_params').$type<MessageParams>(),
}, (table) => [index('analysis_evidence_result_timestamp_idx').on(table.analysisCheckResultId, table.timestamp)]);

export type Job = typeof jobs.$inferSelect;
export type AcceptanceProfile = typeof acceptanceProfiles.$inferSelect;
export type AnalysisRun = typeof analysisRuns.$inferSelect;
export type AnalysisCheckResult = typeof analysisCheckResults.$inferSelect;

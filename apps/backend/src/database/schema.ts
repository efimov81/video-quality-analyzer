import {
  boolean,
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

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceUrl: text('source_url').notNull(),
  title: text('title'),
  description: text('description'),
  localPath: text('local_path'),
  status: jobStatus('status').default('QUEUED').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const acceptanceProfiles = pgTable('acceptance_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  criteria: jsonb('criteria').notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
  profileVersion: integer('profile_version').notNull(),
  profileSnapshot: jsonb('profile_snapshot').notNull().$type<Record<string, unknown>>(),
  status: analysisRunStatus('status').notNull().default('QUEUED'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('analysis_runs_video_created_idx').on(table.videoId, table.createdAt),
  index('analysis_runs_status_idx').on(table.status),
]);

export const analysisCheckResults = pgTable('analysis_check_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  analysisRunId: uuid('analysis_run_id').notNull().references(() => analysisRuns.id, { onDelete: 'cascade' }),
  checkType: text('check_type').notNull(),
  status: checkStatus('status').notNull(),
  measuredValue: jsonb('measured_value'),
  expectedValue: jsonb('expected_value'),
  details: text('details').notNull(),
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
}, (table) => [index('analysis_evidence_result_timestamp_idx').on(table.analysisCheckResultId, table.timestamp)]);

export type Job = typeof jobs.$inferSelect;
export type AcceptanceProfile = typeof acceptanceProfiles.$inferSelect;
export type AnalysisRun = typeof analysisRuns.$inferSelect;
export type AnalysisCheckResult = typeof analysisCheckResults.$inferSelect;

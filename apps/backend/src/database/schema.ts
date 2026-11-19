import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const jobStatus = pgEnum('job_status', ['QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'FAILED']);

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

export type Job = typeof jobs.$inferSelect;

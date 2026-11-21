const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { TransactionRollbackError } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');

const { AnalysisService } = require('../dist/src/analysis/analysis.service');
const { JobsService } = require('../dist/src/jobs/jobs.service');

const connectionString = process.env.USERS_MIGRATION_TEST_DATABASE_URL;
const migrations = resolve(__dirname, '../drizzle');

test('migrates legacy jobs and results and enforces user associations', { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString });
  try {
    await drizzle(pool).transaction(async (db) => {
      const schema = `users_test_${randomUUID().replaceAll('-', '')}`;
      await db.execute(`CREATE SCHEMA "${schema}"`);
      await db.execute(`SET LOCAL search_path = "${schema}"`);

      const { entries } = JSON.parse(readFileSync(resolve(migrations, 'meta/_journal.json'), 'utf8'));
      const apply = async (tag) => {
        const sql = readFileSync(resolve(migrations, `${tag}.sql`), 'utf8');
        for (const statement of sql.replaceAll('"public".', `"${schema}".`).split('--> statement-breakpoint')) {
          await db.execute(statement);
        }
      };
      for (const { tag } of entries) {
        if (tag === '0007_users') break;
        await apply(tag);
      }

      const oldJob = randomUUID();
      const oldRun = randomUUID();
      const profile = randomUUID();
      const sourceUrl = 'https://example.com/video';
      await db.execute(`INSERT INTO jobs (id, source_url, status, local_path)
        VALUES ('${oldJob}', '${sourceUrl}', 'DOWNLOADED', '/dev/null')`);
      await db.execute(`INSERT INTO acceptance_profiles (id, name, criteria) VALUES ('${profile}', 'Test', '{}')`);
      await db.execute(`INSERT INTO analysis_runs (id, video_id, profile_id, profile_version, profile_snapshot, status)
        VALUES ('${oldRun}', '${oldJob}', '${profile}', 1, '{}', 'COMPLETED')`);
      await db.execute(`INSERT INTO analysis_check_results (analysis_run_id, check_type, status, details, analyzer_version)
        VALUES ('${oldRun}', 'resolution', 'PASS', 'legacy result', '1')`);

      await apply('0007_users');

      const jobs = new JobsService({ db }, {});
      const enqueued = [];
      const analysis = new AnalysisService({ db }, [], {}, { enqueue: async (id) => enqueued.push(id) });
      assert.equal((await jobs.get(oldJob)).createdByUserId, null);
      const report = await analysis.report(oldRun);
      assert.equal(report.run.requestedByUserId, null);
      assert.equal(report.run.videoId, oldJob);
      assert.equal(report.checks[0].details, 'legacy result');

      const legacy = await jobs.create(sourceUrl);
      assert.equal(legacy.source, 'web');
      assert.equal(legacy.createdByUserId, null);

      const owner = randomUUID();
      const anotherUser = randomUUID();
      const inactive = randomUUID();
      await db.execute(`INSERT INTO users (id, display_name, is_active)
        VALUES ('${owner}', 'Owner', true), ('${anotherUser}', 'Other', true), ('${inactive}', 'Inactive', false)`);
      await db.execute(`INSERT INTO external_identities (user_id, provider, external_user_id)
        VALUES ('${owner}', 'telegram', '001'), ('${owner}', 'mcp', 'owner'),
          ('${anotherUser}', 'web', '001'), ('${inactive}', 'telegram', '002')`);

      const job = await jobs.create(sourceUrl, 'telegram', '001');
      assert.equal(job.createdByUserId, owner);
      assert.equal((await jobs.create(sourceUrl, undefined, '001')).createdByUserId, anotherUser);
      await assert.rejects(jobs.create(sourceUrl, 'telegram', '002'), { status: 403 });
      await assert.rejects(jobs.create(sourceUrl, 'telegram', '003'), { status: 403 });

      const file = __filename.replaceAll("'", "''");
      await db.execute(`UPDATE jobs SET status = 'DOWNLOADED', local_path = '${file}' WHERE id IN ('${job.id}', '${oldJob}')`);
      await assert.rejects(analysis.create(job.id, profile), { status: 403 });
      await assert.rejects(analysis.create(job.id, profile, { source: 'web', externalUserId: '001' }), { status: 403 });
      assert.deepEqual(enqueued, []);
      const run = await analysis.create(job.id, profile, { source: 'telegram', externalUserId: '001' });
      assert.equal(run.requestedByUserId, owner);
      assert.deepEqual(enqueued, [run.id]);
      const repeated = await analysis.create(job.id, profile, { source: 'mcp', externalUserId: 'owner' });
      assert.equal(repeated.id, run.id);
      const legacyRun = await analysis.create(oldJob, profile);
      assert.equal(legacyRun.requestedByUserId, null);

      const rejectSql = (sql, code) => assert.rejects(db.transaction((tx) => tx.execute(sql)), (error) =>
        (error.cause ?? error).code === code);
      await rejectSql(`INSERT INTO external_identities (user_id, provider, external_user_id)
        VALUES ('${anotherUser}', 'telegram', '001')`, '23505');
      await rejectSql(`INSERT INTO external_identities (user_id, provider, external_user_id)
        VALUES ('${randomUUID()}', 'telegram', 'unassigned')`, '23503');
      await rejectSql(`UPDATE jobs SET created_by_user_id = '${randomUUID()}' WHERE id = '${job.id}'`, '23503');
      await rejectSql(`UPDATE analysis_runs SET requested_by_user_id = '${randomUUID()}' WHERE id = '${run.id}'`, '23503');

      db.rollback();
    }).catch((error) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
  } finally {
    await pool.end();
  }
});

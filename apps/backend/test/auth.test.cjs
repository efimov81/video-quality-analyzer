const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { Module, ValidationPipe } = require('@nestjs/common');
const { APP_GUARD, NestFactory } = require('@nestjs/core');
const { eq, sql, TransactionRollbackError } = require('drizzle-orm');
const { readMigrationFiles } = require('drizzle-orm/migrator');
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');

const { AnalysisController } = require('../dist/src/analysis/analysis.controller');
const { AnalysisService } = require('../dist/src/analysis/analysis.service');
const { AuthController } = require('../dist/src/auth/auth.controller');
const { AuthService } = require('../dist/src/auth/auth.service');
const { SessionGuard } = require('../dist/src/auth/session.guard');
const { UsersController } = require('../dist/src/auth/users.controller');
const { UsersService } = require('../dist/src/auth/users.service');
const { DATABASE } = require('../dist/src/database/database.module');
const { acceptanceProfiles, analysisCheckResults, analysisRuns, jobs, sessions, users } = require('../dist/src/database/schema');
const { JobsController } = require('../dist/src/jobs/jobs.controller');
const { JobsService } = require('../dist/src/jobs/jobs.service');

const connectionString = process.env.USERS_MIGRATION_TEST_DATABASE_URL;
const sourceUrl = 'https://example.com/video';

async function createTestApp(db, enqueued) {
  const jobsService = new JobsService({ db }, {});
  class TestModule {}
  Module({
    controllers: [AuthController, UsersController, JobsController, AnalysisController],
    providers: [
      AuthService,
      UsersService,
      { provide: APP_GUARD, useClass: SessionGuard },
      { provide: DATABASE, useValue: { db } },
      { provide: AnalysisService, useValue: new AnalysisService({ db }, [], {}, { enqueue: async (id) => enqueued.push(id) }) },
      {
        provide: JobsService,
        useValue: {
          create: jobsService.create.bind(jobsService),
          get: jobsService.get.bind(jobsService),
          list: jobsService.list.bind(jobsService),
        },
      },
    ],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(0, '127.0.0.1');
  return app;
}

async function verifyAuth(app, db, enqueued) {
  const base = await app.getUrl();
  const call = async (path, { method = 'GET', cookie, body, status = 200, origin } = {}) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}/api${path}`, { method, headers, body: JSON.stringify(body) });
    const data = response.status === 204 ? undefined : await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${data?.message ?? ''}`);
    return { data, cookie: response.headers.get('set-cookie') };
  };
  const post = (path, body, cookie, status = 200) => call(path, { method: 'POST', body, cookie, status });
  const login = async (login, password) => {
    const result = await post('/auth/login', { login, password });
    return { user: result.data, cookie: result.cookie.split(';')[0], setCookie: result.cookie };
  };

  await call('/jobs', { status: 401 });
  await post('/auth/login', { login: 'admin', password: 'wrong' }, undefined, 401);
  await post('/auth/login', { login: 'missing', password: 'wrong' }, undefined, 401);
  await call('/auth/login', {
    method: 'POST', body: { login: 'admin', password: 'admin' }, origin: 'https://untrusted.example', status: 403,
  });

  const admin = await login('admin', 'admin');
  assert.equal(admin.user.role, 'admin');
  assert.equal(admin.user.mustChangePassword, true);
  assert.match(admin.setCookie, /HttpOnly/i);
  assert.match(admin.setCookie, /SameSite=Strict/i);
  assert.equal('passwordHash' in admin.user, false);
  assert.equal((await call('/auth/me', { cookie: admin.cookie })).data.id, admin.user.id);
  await call('/users', { cookie: admin.cookie, status: 403 });
  await call('/jobs', { cookie: admin.cookie, status: 403 });
  await post('/auth/password', { currentPassword: 'wrong', password: 'strong-admin' }, admin.cookie, 400);
  assert.equal((await post('/auth/password', { currentPassword: 'admin', password: 'strong-admin' }, admin.cookie))
    .data.mustChangePassword, false);
  await post('/auth/login', { login: 'admin', password: 'admin' }, undefined, 401);
  await call(`/users/${admin.user.id}`, { method: 'PATCH', body: { isActive: false }, cookie: admin.cookie, status: 409 });
  await call(`/users/${admin.user.id}`, { method: 'PATCH', body: { role: 'user' }, cookie: admin.cookie, status: 409 });

  const createUser = (login) => post('/users', { login, password: 'temporary-123', displayName: login, role: 'user' }, admin.cookie, 201);
  for (const name of ['alice', 'bob']) {
    assert.equal((await createUser(name)).data.mustChangePassword, true);
  }
  await post('/users', { login: 'alice', password: 'temporary-123', displayName: 'duplicate', role: 'user' }, admin.cookie, 409);
  const alice = await login('alice', 'temporary-123');
  const bob = await login('bob', 'temporary-123');
  for (const { cookie } of [alice, bob]) {
    await post('/auth/password', { currentPassword: 'temporary-123', password: 'personal-123' }, cookie);
    await call('/users', { cookie, status: 403 });
    await post('/users', { login: 'injected', password: 'temporary-123', displayName: 'injected', role: 'admin' }, cookie, 403);
  }

  const aliceJob = (await post('/jobs', { sourceUrl, createdByUserId: bob.user.id, source: 'mcp' }, alice.cookie, 201)).data;
  assert.equal(aliceJob.createdByUserId, alice.user.id);
  assert.equal(aliceJob.source, 'web');
  const bobJob = (await post('/jobs', { sourceUrl }, bob.cookie, 201)).data;
  const [legacyJob] = await db.insert(jobs).values({ sourceUrl }).returning();
  assert.deepEqual((await call('/jobs', { cookie: alice.cookie })).data.map(({ id }) => id), [aliceJob.id]);
  assert.deepEqual((await call('/jobs', { cookie: bob.cookie })).data.map(({ id }) => id), [bobJob.id]);
  const adminJobs = (await call('/jobs', { cookie: admin.cookie })).data;
  assert.equal(adminJobs.length, 3);
  const expectedCreator = { id: alice.user.id, username: 'alice', displayName: 'alice' };
  assert.deepEqual(adminJobs.find(({ id }) => id === aliceJob.id).createdBy, expectedCreator);
  assert.deepEqual((await call(`/jobs/${aliceJob.id}`, { cookie: admin.cookie })).data, {
    ...aliceJob,
    createdBy: expectedCreator,
  });
  assert.deepEqual((await call(`/jobs/${aliceJob.id}`, { cookie: alice.cookie })).data.createdBy, expectedCreator);
  assert.equal(adminJobs.find(({ id }) => id === legacyJob.id).createdBy, null);
  await call(`/jobs/${aliceJob.id}`, { cookie: bob.cookie, status: 403 });
  await call(`/jobs/${legacyJob.id}`, { cookie: alice.cookie, status: 403 });
  assert.equal((await call(`/jobs/${legacyJob.id}`, { cookie: admin.cookie })).data.createdBy, null);

  const [profile] = await db.select().from(acceptanceProfiles).limit(1);
  const runBody = { videoId: aliceJob.id, profileId: profile.id, requestedByUserId: bob.user.id };
  await post('/analysis-runs', runBody, bob.cookie, 403);
  await db.update(jobs).set({ status: 'DOWNLOADED', localPath: __filename }).where(eq(jobs.id, aliceJob.id));
  const run = (await post('/analysis-runs', runBody, alice.cookie, 202)).data;
  assert.equal(run.requestedByUserId, alice.user.id);
  assert.deepEqual(enqueued, [run.id]);
  const [legacyRun] = await db.insert(analysisRuns).values({
    videoId: legacyJob.id, profileId: profile.id, profileVersion: profile.version, profileSnapshot: {},
  }).returning();
  const [crossOwnerRun] = await db.insert(analysisRuns).values({
    videoId: bobJob.id, profileId: profile.id, profileVersion: profile.version, profileSnapshot: {},
    requestedByUserId: alice.user.id,
  }).returning();
  await db.insert(analysisCheckResults).values({
    analysisRunId: run.id, checkType: 'resolution', status: 'PASS', details: 'result', analyzerVersion: '1',
  });

  assert.deepEqual((await call('/analysis-runs', { cookie: alice.cookie })).data.map(({ run }) => run.id), [run.id]);
  assert.deepEqual((await call('/analysis-runs', { cookie: bob.cookie })).data, []);
  assert.equal((await call('/analysis-runs', { cookie: admin.cookie })).data.length, 3);
  await call(`/analysis-runs/${run.id}`, { cookie: bob.cookie, status: 403 });
  await call(`/analysis-runs/${run.id}/report`, { cookie: bob.cookie, status: 403 });
  await call(`/analysis-runs/${crossOwnerRun.id}/report`, { cookie: alice.cookie, status: 403 });
  await call(`/analysis-runs/${legacyRun.id}/report`, { cookie: alice.cookie, status: 403 });
  await call(`/analysis-runs/${legacyRun.id}/report`, { cookie: admin.cookie });
  assert.equal((await call(`/analysis-runs/${run.id}/report`, { cookie: alice.cookie })).data.checks[0].details, 'result');

  await post(`/users/${alice.user.id}/password`, { password: 'reset-123' }, admin.cookie, 204);
  await call('/auth/me', { cookie: alice.cookie, status: 401 });
  await post('/auth/login', { login: 'alice', password: 'personal-123' }, undefined, 401);
  const resetAlice = await login('alice', 'reset-123');
  assert.equal(resetAlice.user.mustChangePassword, true);

  await db.update(sessions).set({ expiresAt: new Date(0) }).where(eq(sessions.userId, alice.user.id));
  await call('/auth/me', { cookie: resetAlice.cookie, status: 401 });
  await call(`/users/${bob.user.id}`, { method: 'PATCH', body: { isActive: false }, cookie: admin.cookie });
  await call('/auth/me', { cookie: bob.cookie, status: 401 });
  await post('/auth/login', { login: 'bob', password: 'personal-123' }, undefined, 401);
  await call(`/users/${bob.user.id}`, { method: 'PATCH', body: { isActive: true, displayName: 'Bobby' }, cookie: admin.cookie });
  await call('/auth/me', { cookie: bob.cookie, status: 401 });
  assert.equal((await login('bob', 'personal-123')).user.displayName, 'Bobby');

  const logout = await post('/auth/logout', undefined, admin.cookie, 204);
  assert.match(logout.cookie, /Expires=/i);
  await call('/auth/me', { cookie: admin.cookie, status: 401 });
  await db.update(users).set({ login: 'renamed-admin' }).where(eq(users.id, admin.user.id));
  await app.get(AuthService).onModuleInit();
  assert.deepEqual(await db.select().from(users).where(eq(users.login, 'admin')), []);
}

test('auth sessions and ownership are enforced through the HTTP API', { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString });
  try {
    await drizzle(pool).transaction(async (db) => {
      const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
      await db.execute(sql.raw(`CREATE SCHEMA "${schema}"`));
      await db.execute(sql.raw(`SET LOCAL search_path = "${schema}"`));
      const migrations = readMigrationFiles({ migrationsFolder: resolve(__dirname, '../drizzle') });
      for (const migration of migrations) {
        for (const statement of migration.sql) {
          await db.execute(sql.raw(statement.replaceAll('"public".', `"${schema}".`)));
        }
      }

      const enqueued = [];
      const app = await createTestApp(db, enqueued);
      try {
        await verifyAuth(app, db, enqueued);
      } finally {
        await app.close();
      }
      db.rollback();
    }).catch((error) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
  } finally {
    await pool.end();
  }
});

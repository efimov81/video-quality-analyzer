const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ValidationPipe } = require('@nestjs/common');

const { jobs } = require('../dist/src/database/schema');
const { JobsController } = require('../dist/src/jobs/jobs.controller');
const { JobsService } = require('../dist/src/jobs/jobs.service');

test('web jobs take ownership and source from the authenticated request', async () => {
  const db = {
    transaction: (run) => run(db),
    execute: async () => {},
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
    insert(table) {
      assert.equal(table, jobs);
      return { values: (values) => ({ returning: async () => [values] }) };
    },
  };
  const controller = new JobsController(new JobsService({ db }, {}));
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const [metatype] = Reflect.getMetadata('design:paramtypes', JobsController.prototype, 'create');
  const sourceUrl = 'https://example.com/video';
  const user = { id: 'signed-in-user', role: 'user' };
  const input = await pipe.transform({
    sourceUrl,
    source: 'telegram',
    externalUserId: 'other',
    createdByUserId: 'other',
  }, { type: 'body', metatype });

  assert.deepEqual(await controller.create(input, user), { sourceUrl, source: 'web', createdByUserId: user.id });
  assert.equal(jobs.source.default, 'web');
  assert.equal(jobs.source.notNull, true);
  assert.equal(jobs.source.getSQLType(), 'text');
});

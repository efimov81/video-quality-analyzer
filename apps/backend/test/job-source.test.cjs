const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BadRequestException, Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

const { jobs } = require('../dist/src/database/schema');
const { JobsController } = require('../dist/src/jobs/jobs.controller');
const { JobsService } = require('../dist/src/jobs/jobs.service');

test('accepts known job sources, defaults to web and rejects invalid values', async (t) => {
  const inserted = [];
  const db = {
    insert(table) {
      assert.equal(table, jobs);
      return {
        values(values) {
          inserted.push(values);
          return { returning: async () => [values] };
        },
      };
    },
  };

  const jobsService = new JobsService({ db }, {});
  class ContractModule {}
  Module({
    controllers: [JobsController],
    providers: [{ provide: JobsService, useValue: { create: jobsService.create.bind(jobsService) } }],
  })(ContractModule);

  const app = await NestFactory.create(ContractModule, { logger: false });
  t.after(() => app.close());
  const controller = app.get(JobsController);
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const [metatype] = Reflect.getMetadata('design:paramtypes', JobsController.prototype, 'create');
  const sourceUrl = 'https://example.com/video';
  const create = async (body) => controller.create(await pipe.transform(body, { type: 'body', metatype }));

  for (const source of [undefined, 'web', 'telegram', 'mcp']) {
    const body = source === undefined ? { sourceUrl } : { sourceUrl, source };
    const expected = { sourceUrl, source: source ?? 'web' };
    assert.deepEqual(await create(body), expected);
    assert.deepEqual(inserted.at(-1), expected);
  }

  for (const source of [null, '', 'unknown', 'MCP', 1, ['web'], { source: 'web' }]) {
    await assert.rejects(create({ sourceUrl, source }), BadRequestException);
  }
  assert.equal(inserted.length, 4);

  const { components } = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const { CreateJobDto, JobResponseDto } = components.schemas;
  assert.deepEqual(CreateJobDto.properties.source, {
    type: 'string',
    enum: ['web', 'telegram', 'mcp'],
    default: 'web',
  });
  assert.ok(!CreateJobDto.required.includes('source'));
  assert.deepEqual(JobResponseDto.properties.source, {
    type: 'string',
    enum: ['web', 'telegram', 'mcp'],
  });
  assert.ok(JobResponseDto.required.includes('source'));
  assert.equal(jobs.source.default, 'web');
  assert.equal(jobs.source.notNull, true);
  assert.equal(jobs.source.getSQLType(), 'text');
});

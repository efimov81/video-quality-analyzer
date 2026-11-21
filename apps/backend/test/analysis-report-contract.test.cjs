const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

const { AnalysisController } = require('../dist/src/analysis/analysis.controller');
const { AnalysisService } = require('../dist/src/analysis/analysis.service');
const { JobsController } = require('../dist/src/jobs/jobs.controller');
const { JobsService } = require('../dist/src/jobs/jobs.service');

class ContractTestModule {}
Module({
  controllers: [AnalysisController, JobsController],
  providers: [
    { provide: AnalysisService, useValue: {} },
    { provide: JobsService, useValue: {} },
  ],
})(ContractTestModule);

test('documents the job creator on list and detail responses while preserving existing fields', async (t) => {
  const app = await NestFactory.create(ContractTestModule, { logger: false });
  t.after(() => app.close());
  const { paths, components } = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const { JobCreatorDto, JobDetailsDto, JobResponseDto } = components.schemas;
  const responseSchema = (operation, status = '200') => operation.responses[status].content['application/json'].schema;
  const detailRef = { $ref: '#/components/schemas/JobDetailsDto' };

  assert.deepEqual(responseSchema(paths['/api/jobs'].get), { type: 'array', items: detailRef });
  assert.deepEqual(responseSchema(paths['/api/jobs/{id}'].get), detailRef);
  assert.deepEqual(responseSchema(paths['/api/jobs'].post, '201'), { $ref: '#/components/schemas/JobResponseDto' });
  const { createdBy, ...existingProperties } = JobDetailsDto.properties;
  assert.deepEqual(existingProperties, JobResponseDto.properties);
  assert.deepEqual(createdBy, {
    type: 'object', nullable: true, allOf: [{ $ref: '#/components/schemas/JobCreatorDto' }],
  });
  assert.ok(JobDetailsDto.required.includes('createdBy'));
  assert.deepEqual(JobCreatorDto.properties, {
    id: { type: 'string', format: 'uuid' },
    username: { type: 'string', nullable: true },
    displayName: { type: 'string' },
  });
});

test('documents report checks, evidence, profile and video with their JSON types', async (t) => {
  const app = await NestFactory.create(ContractTestModule, { logger: false });
  t.after(() => app.close());

  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const schemas = document.components.schemas;
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const arrayOf = (name) => ({ type: 'array', items: ref(name) });

  const response = document.paths['/api/analysis-runs/{id}/report'].get.responses['200'];
  assert.deepEqual(response.content['application/json'].schema, ref('AnalysisReportDto'));

  const notFound = document.paths['/api/analysis-runs/{id}/report'].get.responses['404'];
  assert.deepEqual(notFound.content['application/json'].schema, ref('ApiMessageErrorDto'));

  const report = schemas.AnalysisReportDto.properties;
  assert.deepEqual(report.checks, arrayOf('AnalysisCheckResultDto'));
  assert.deepEqual(report.video, ref('JobResponseDto'));
  assert.deepEqual(report.profile, ref('ProfileSnapshotDto'));
  assert.deepEqual(schemas.AnalysisRunResponseDto.properties.profileSnapshot, report.profile);

  const checks = schemas.AnalysisCheckResultDto;
  const evidence = schemas.AnalysisEvidenceDto;
  assert.deepEqual(checks.properties.evidence, arrayOf('AnalysisEvidenceDto'));
  assert.ok(checks.required.includes('evidence'));
  for (const schema of [checks, evidence]) {
    assert.deepEqual(schema.properties.messageCode, { type: 'string', nullable: true });
    assert.deepEqual(schema.properties.messageParams.anyOf[1], { type: 'string', nullable: true, enum: [null] });
    assert.deepEqual(schema.properties.messageParams.anyOf[0].additionalProperties.anyOf.map(({ type }) => type),
      ['string', 'number', 'boolean']);
    assert.ok(schema.required.includes('messageCode'));
    assert.ok(schema.required.includes('messageParams'));
  }
  assert.equal(evidence.properties.timestamp.type, 'number');
  assert.equal(evidence.properties.problemType.type, 'string');
  assert.equal(schemas.JobResponseDto.properties.title.nullable, true);
  assert.equal(schemas.AnalysisRunResponseDto.properties.completedAt.nullable, true);

  for (const [schema, field] of [
    [checks, 'measuredValue'],
    [checks, 'expectedValue'],
    [evidence, 'measuredValue'],
  ]) {
    assert.ok(schema.required.includes(field));
    const variants = schema.properties[field].anyOf;
    assert.deepEqual(new Set(variants.map(({ type }) => type)), new Set([
      'object', 'array', 'number', 'boolean', 'string',
    ]));
    assert.ok(variants.some(({ nullable }) => nullable === true));
  }
});

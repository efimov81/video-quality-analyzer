const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

const { AnalysisController } = require('../dist/src/analysis/analysis.controller');
const { AnalysisService } = require('../dist/src/analysis/analysis.service');

class ContractTestModule {}
Module({
  controllers: [AnalysisController],
  providers: [{ provide: AnalysisService, useValue: {} }],
})(ContractTestModule);

test('documents report checks, evidence, profile and video with their JSON types', async (t) => {
  const app = await NestFactory.create(ContractTestModule, { logger: false });
  t.after(() => app.close());

  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const schemas = document.components.schemas;
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const arrayOf = (name) => ({ type: 'array', items: ref(name) });

  const response = document.paths['/api/analysis-runs/{id}/report'].get.responses['200'];
  assert.deepEqual(response.content['application/json'].schema, ref('AnalysisReportDto'));

  const report = schemas.AnalysisReportDto.properties;
  assert.deepEqual(report.checks, arrayOf('AnalysisCheckResultDto'));
  assert.deepEqual(report.video, ref('JobResponseDto'));
  assert.deepEqual(report.profile, ref('ProfileSnapshotDto'));
  assert.deepEqual(schemas.AnalysisRunResponseDto.properties.profileSnapshot, report.profile);

  const checks = schemas.AnalysisCheckResultDto;
  const evidence = schemas.AnalysisEvidenceDto;
  assert.deepEqual(checks.properties.evidence, arrayOf('AnalysisEvidenceDto'));
  assert.ok(checks.required.includes('evidence'));
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

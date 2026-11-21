const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DEFAULT_PROFILE_CRITERIA } = require('../dist/src/analysis/profile-criteria');
const { analysisRunStatus, checkStatus, jobStatus } = require('../dist/src/database/schema');
const en = require('../../frontend/src/assets/i18n/en.json');
const ru = require('../../frontend/src/assets/i18n/ru.json');

test('both catalogs cover every check and use matching interpolation parameters', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  for (const checkType of Object.keys(DEFAULT_PROFILE_CRITERIA)) {
    assert.ok(en[`check.${checkType}`]);
  }

  for (const [group, statuses] of [
    ['check', checkStatus.enumValues],
    ['job', jobStatus.enumValues],
    ['run', analysisRunStatus.enumValues],
  ]) {
    for (const status of statuses) assert.ok(en[`status.${group}.${status}`]);
  }
  for (const verdict of ['ACCEPT', 'REJECT', 'MANUAL_REVIEW']) {
    assert.ok(en[`verdict.${verdict}`]);
  }

  const placeholders = (value) => (value.match(/{{\s*\w+\s*}}/g) ?? []).sort();
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim(), key);
    assert.ok(ru[key].trim(), key);
    assert.deepEqual(placeholders(value), placeholders(ru[key]), key);
  }
});

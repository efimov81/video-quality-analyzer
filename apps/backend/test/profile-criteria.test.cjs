const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { DEFAULT_PROFILE_CRITERIA, normalizeCriteria } = require('../dist/src/analysis/profile-criteria');

test('profile criteria fill defaults and retain custom enabled thresholds', () => {
  const criteria = normalizeCriteria({
    scene_cuts: { enabled: true, minIntervalSec: 3 },
    speech_vad: { enabled: false },
  });

  assert.equal(criteria.resolution.minWidth, DEFAULT_PROFILE_CRITERIA.resolution.minWidth);
  assert.equal(criteria.scene_cuts.minIntervalSec, 3);
  assert.equal(criteria.speech_vad.enabled, false);
});

test('profile criteria reject a non-boolean enabled flag', () => {
  assert.throws(() => normalizeCriteria({ audio_presence: { enabled: 'yes' } }), BadRequestException);
});

test('profile criteria reject negative resolution thresholds', () => {
  assert.throws(() => normalizeCriteria({ resolution: { minWidth: -1 } }), BadRequestException);
});

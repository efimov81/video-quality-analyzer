const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeCriteria } = require('../dist/src/analysis/profile-criteria');
const { VideoDownloaderService } = require('../dist/src/downloader/video-downloader.service');
const { evaluateMetadata, metadataFailure } = require('../dist/src/downloader/video-preflight');
const { formatPreflightFailure } = require('../dist/src/downloader/preflight-message');

const rules = normalizeCriteria({ resolution: { minDurationSec: 2, maxDurationSec: 1200, allowShorts: false } });
const fullHd = { vcodec: 'avc1', width: 1920, height: 1080 };
const metadata = { duration: 90, formats: [fullHd], is_short: false };

test('uses profile boundaries and rejects all confirmed violations', () => {
  for (const duration of [2, 1200]) assert.equal(evaluateMetadata({ ...metadata, duration }, rules).status, 'PASSED');
  assert.equal(evaluateMetadata({ ...metadata, duration: 1 }, rules).checks[1].reason, 'tooShort');
  const results = evaluateMetadata({
    ...metadata, duration: 1935, is_short: true, formats: [{ vcodec: 'avc1', width: 640, height: 480 }],
  }, rules);
  assert.equal(results.status, 'REJECTED');
  assert.deepEqual(results.checks.filter(check => check.status === 'REJECTED').map(check => check.reason),
    ['tooLong', 'shortsForbidden', 'resolutionTooLow']);
  const message = formatPreflightFailure(results, 'ru');
  assert.match(message, /32:15.*20:00/);
  assert.match(message, /Shorts запрещены/);
  assert.match(message, /1920×1080/);
});

test('handles incomplete watch metadata and does not infer Shorts from portrait video', () => {
  const partial = {
    webpage_url: 'https://www.youtube.com/watch?v=LIIOUrjAETU', formats: [
      { vcodec: 'avc1', width: 1080, height: 1920 }, { vcodec: 'none' },
    ],
  };
  const result = evaluateMetadata(partial, rules);
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.equal(result.checks.find(check => check.check === 'shorts').status, 'INCONCLUSIVE');
  assert.equal(result.checks.find(check => check.check === 'resolution').status, 'PASSED');
  assert.equal(evaluateMetadata({ duration: 90, formats: [], is_short: false }, rules).status, 'INCONCLUSIVE');
  assert.equal(evaluateMetadata({ ...metadata, formats: [
    { vcodec: 'avc1', width: 640, height: 360 }, { vcodec: 'vp9' },
  ] }, rules).status, 'INCONCLUSIVE');
  assert.equal(evaluateMetadata({ ...metadata, webpage_url: 'https://www.youtube.com/shorts/LIIOUrjAETU' }, rules).status, 'REJECTED');
  assert.throws(() => normalizeCriteria({ resolution: { preflightInconclusive: 'anything' } }));
});

test('separates unavailable videos from errors fetching their metadata', () => {
  assert.equal(evaluateMetadata({ ...metadata, availability: 'private' }, rules).status, 'REJECTED');
  assert.equal(metadataFailure('ERROR: This video has been removed by the uploader').status, 'REJECTED');
  assert.equal(metadataFailure('ERROR: Video unavailable').status, 'REJECTED');
  assert.equal(metadataFailure('yt-dlp timed out').checks[0].reason, 'metadataTimeout');
  assert.equal(metadataFailure('HTTP Error 429: Too Many Requests').status, 'ERROR');
});

test('explicit Shorts use no subprocess, and permitted probes run in simulation mode', async () => {
  const downloader = new VideoDownloaderService();
  downloader.validateSource = async (url) => url;
  let probeArgs;
  downloader.runYtDlp = async (args) => {
    probeArgs = args;
    return JSON.stringify(metadata);
  };
  const short = 'https://www.youtube.com/shorts/LIIOUrjAETU';
  assert.equal((await downloader.preflight(short, rules)).result.status, 'REJECTED');
  assert.equal(probeArgs, undefined);
  const watch = 'https://www.youtube.com/watch?v=LIIOUrjAETU';
  assert.equal((await downloader.preflight(watch, rules)).result.status, 'PASSED');
  assert.ok(['--simulate', '--skip-download', '--dump-single-json', '--ignore-config'].every((arg) => probeArgs.includes(arg)));
  assert.equal(probeArgs.at(-1), watch);
});

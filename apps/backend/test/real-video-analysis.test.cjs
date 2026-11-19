const test = require('node:test');
const assert = require('node:assert/strict');
const { MediaToolsService } = require('../dist/src/analysis/media-tools.service');
const { DEFAULT_PROFILE_CRITERIA, normalizeCriteria } = require('../dist/src/analysis/profile-criteria');
const { MetadataAnalyzer } = require('../dist/src/analysis/analyzers/metadata.analyzer');
const { AudioPresenceAnalyzer } = require('../dist/src/analysis/analyzers/audio-presence.analyzer');
const { AudioSignalAnalyzer } = require('../dist/src/analysis/analyzers/audio-signal.analyzer');
const { ClippingAnalyzer } = require('../dist/src/analysis/analyzers/clipping.analyzer');
const { SceneCutsAnalyzer } = require('../dist/src/analysis/analyzers/scene-cuts.analyzer');
const { VisualAnalyzer } = require('../dist/src/analysis/analyzers/visual.analyzer');
const { UpscalingAnalyzer } = require('../dist/src/analysis/analyzers/upscaling.analyzer');

const videoPath = process.env.VIDEO_ANALYSIS_TEST_FILE;

test('runs independent technical analyzers on a downloaded real video', { skip: !videoPath }, async (t) => {
  const tools = new MediaToolsService();
  const media = await tools.probe(videoPath);
  const criteria = normalizeCriteria(DEFAULT_PROFILE_CRITERIA);
  const input = { runId: 'test', videoId: 'test', filePath: videoPath, media, criteria };
  const analyzers = [
    new MetadataAnalyzer(),
    new AudioPresenceAnalyzer(),
    new AudioSignalAnalyzer(tools),
    new ClippingAnalyzer(tools),
    new SceneCutsAnalyzer(tools),
    new VisualAnalyzer(tools),
    new UpscalingAnalyzer(),
  ];
  const results = [];
  for (const analyzer of analyzers) results.push(...await analyzer.analyze(input));

  const byType = new Map(results.map((result) => [result.checkType, result]));
  assert.equal(byType.get('resolution').measuredValue.width, 1080);
  assert.equal(byType.get('resolution').measuredValue.height, 1920);
  assert.equal(byType.get('audio_presence').measuredValue.audioStreamCount, 1);
  assert.ok(byType.get('audio_loudness').measuredValue.inputIntegratedLufs < 0);
  assert.ok(Number.isFinite(byType.get('audio_clipping').measuredValue.fullScaleSampleRatio));
  assert.ok(Number.isInteger(byType.get('scene_cuts').measuredValue.cutCount));
  assert.ok(byType.get('visual_brightness').measuredValue.sampledFrames > 0);
  assert.equal(byType.get('upscaling_experimental').status, 'WARNING');
  t.diagnostic(JSON.stringify(Object.fromEntries(results.map(({ checkType, status, measuredValue }) => [checkType, { status, measuredValue }]))));
});

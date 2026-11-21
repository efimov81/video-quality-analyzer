const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { MediaToolsService } = require('../dist/src/analysis/media-tools.service');
const { DEFAULT_PROFILE_CRITERIA, normalizeCriteria } = require('../dist/src/analysis/profile-criteria');
const { AudioPresenceAnalyzer } = require('../dist/src/analysis/analyzers/audio-presence.analyzer');
const { AudioSignalAnalyzer } = require('../dist/src/analysis/analyzers/audio-signal.analyzer');
const { SceneCutsAnalyzer } = require('../dist/src/analysis/analyzers/scene-cuts.analyzer');
const { VisualAnalyzer } = require('../dist/src/analysis/analyzers/visual.analyzer');
const { ClippingAnalyzer } = require('../dist/src/analysis/analyzers/clipping.analyzer');

function createVideo(filePath, ffmpegArgs) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...ffmpegArgs, filePath], { stdio: 'pipe' });
}

test('detects known audio and visual conditions in FFmpeg media fixtures', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'vqa-analysis-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const noAudio = join(directory, 'no-audio.mkv');
  const silentAudio = join(directory, 'silent-audio.mkv');
  const sceneChanges = join(directory, 'scene-changes.mkv');
  const blackFrames = join(directory, 'black-frames.mkv');
  const frozenFrames = join(directory, 'frozen-frames.mkv');
  const clippedAudio = join(directory, 'clipped-audio.mkv');
  const brightFrames = join(directory, 'bright-frames.mkv');

  createVideo(noAudio, ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=2', '-an', '-c:v', 'mpeg4', '-threads', '1', '-f', 'matroska']);
  createVideo(silentAudio, ['-f', 'lavfi', '-i', 'color=c=blue:size=320x240:rate=10:duration=3', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=48000:duration=3', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'mpeg4', '-c:a', 'pcm_s16le', '-threads', '1', '-f', 'matroska']);
  createVideo(sceneChanges, [
    '-f', 'lavfi', '-i', 'color=c=red:size=320x240:rate=10:duration=2',
    '-f', 'lavfi', '-i', 'color=c=blue:size=320x240:rate=10:duration=2',
    '-f', 'lavfi', '-i', 'color=c=green:size=320x240:rate=10:duration=2',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-an', '-c:v', 'mpeg4', '-threads', '1', '-f', 'matroska',
  ]);
  createVideo(blackFrames, [
    '-f', 'lavfi', '-i', 'color=c=black:size=320x240:rate=10:duration=2',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=2',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-an', '-c:v', 'mpeg4', '-threads', '1', '-f', 'matroska',
  ]);
  createVideo(frozenFrames, ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=2', '-vf', 'tpad=stop_mode=clone:stop_duration=3', '-t', '5', '-an', '-c:v', 'mpeg4', '-threads', '1', '-f', 'matroska']);
  createVideo(clippedAudio, ['-f', 'lavfi', '-i', 'color=c=blue:size=320x240:rate=10:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=3', '-map', '0:v:0', '-map', '1:a:0', '-af', 'volume=20', '-c:v', 'mpeg4', '-c:a', 'pcm_f32le', '-threads', '1', '-f', 'matroska']);
  createVideo(brightFrames, ['-f', 'lavfi', '-i', 'color=c=white:size=320x240:rate=10:duration=3', '-an', '-c:v', 'mpeg4', '-threads', '1', '-f', 'matroska']);

  const tools = new MediaToolsService();
  const criteria = normalizeCriteria({
    ...DEFAULT_PROFILE_CRITERIA,
    scene_cuts: { ...DEFAULT_PROFILE_CRITERIA.scene_cuts, sensitivity: 1, dedupWindowSec: 0.5, minIntervalSec: 5 },
  });
  const makeInput = async (filePath) => ({ runId: 'fixture', videoId: 'fixture', filePath, media: await tools.probe(filePath), criteria });

  const silentInput = await makeInput(noAudio);
  const noAudioResult = (await new AudioPresenceAnalyzer().analyze(silentInput))[0];
  assert.equal(noAudioResult.status, 'FAIL');
  assert.equal(noAudioResult.messageCode, 'analysis.audio_presence.requiredMissing');

  const emptyInput = await makeInput(silentAudio);
  assert.equal((await new AudioPresenceAnalyzer().analyze(emptyInput))[0].status, 'PASS');
  const emptySignalResult = (await new AudioSignalAnalyzer(tools).analyze(emptyInput)).find((result) => result.checkType === 'audio_silence');
  assert.equal(emptySignalResult.status, 'FAIL');
  assert.equal(emptySignalResult.messageCode, 'analysis.audio_silence.zeroSignal');

  const cutsResult = (await new SceneCutsAnalyzer(tools).analyze(await makeInput(sceneChanges)))[0];
  assert.ok(cutsResult.measuredValue.cutCount >= 2);
  assert.equal(cutsResult.status, 'FAIL');
  assert.equal(cutsResult.messageCode, 'analysis.scene_cuts.shortIntervals');
  assert.equal(cutsResult.messageParams.count, cutsResult.evidence.length);
  assert.equal(cutsResult.evidence[0].messageCode, 'analysis.evidence.frequent_scene_cut');
  assert.equal(cutsResult.evidence[0].messageParams.limit, 5);

  const blackResult = (await new VisualAnalyzer(tools).analyze(await makeInput(blackFrames))).find((result) => result.checkType === 'black_screens');
  assert.equal(blackResult.status, 'FAIL');
  assert.ok(blackResult.evidence.some((item) => item.timestamp < 2));

  const freezeResult = (await new VisualAnalyzer(tools).analyze(await makeInput(frozenFrames))).find((result) => result.checkType === 'frozen_frames');
  assert.equal(freezeResult.status, 'WARNING');
  assert.ok(freezeResult.evidence.length > 0);

  const clippingResult = (await new ClippingAnalyzer(tools).analyze(await makeInput(clippedAudio)))[0];
  assert.ok(clippingResult.measuredValue.fullScaleSampleRatio > 0.001);
  assert.equal(clippingResult.status, 'FAIL');

  const brightCriteria = normalizeCriteria({
    ...DEFAULT_PROFILE_CRITERIA,
    visual_brightness: { ...DEFAULT_PROFILE_CRITERIA.visual_brightness, overexposedY: 230, maxProblemFrameRatio: 0.5 },
  });
  const brightInput = await makeInput(brightFrames);
  brightInput.criteria = brightCriteria;
  const brightnessResult = (await new VisualAnalyzer(tools).analyze(brightInput)).find((result) => result.checkType === 'visual_brightness');
  assert.equal(brightnessResult.status, 'FAIL');
  assert.equal(brightnessResult.measuredValue.overexposedFrameCount, 3);
});

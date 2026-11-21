const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DEFAULT_PROFILE_CRITERIA } = require('../dist/src/analysis/profile-criteria');
const { formatTelegramReport } = require('../dist/src/telegram/telegram-report');

const url = 'https://www.youtube.com/watch?v=LIIOUrjAETU';
const check = (type, status = 'PASS', fields = {}) => ({
  checkType: type, status, measuredValue: null, expectedValue: null,
  details: 'internal diagnostic', evidence: [], ...fields,
});
const interval = (start, end) => ({
  timestamp: start, problemType: 'silence', measuredValue: { start, end }, details: 'Evidence',
});
const format = (checks, options = {}) => formatTelegramReport({
  video: { sourceUrl: options.url ?? url, title: options.title ?? 'Example Video' },
  profile: { name: 'Base', version: 2 },
  conclusion: options.conclusion ?? 'ACCEPT',
  checks,
}, options.language ?? 'ru');
const visible = (caption) => caption.replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, 'x');

test('shows every stored check, the video metadata and a clean total', () => {
  const { caption } = format(Object.keys(DEFAULT_PROFILE_CRITERIA).map(type => check(type, 'PASS', type === 'resolution' ? {
    measuredValue: { durationSec: 754, width: 1920, height: 1080 },
    expectedValue: { minWidth: 1920, minHeight: 1080 },
  } : {})));
  assert.match(caption, /Длительность 12:34 · 1920×1080/);
  assert.match(caption, /Разрешение — в норме, 1920×1080 \(≥ 1920×1080\)/);
  assert.equal(caption.split('\n').filter(line => line.startsWith('✅ ')).length, 13);
  assert.match(caption, /Итого: ✅ 13 \| ❌ 0 \| ⚠️ 0/);
  assert.doesNotMatch(caption, /Подозрительные участки|internal diagnostic/);
});

test('uses stored intervals and single timestamps, with localized statuses and links', () => {
  const { caption } = format([
    check('audio_silence', 'FAIL', {
      measuredValue: { longestSilenceSec: 8 }, expectedValue: { maxSegmentSec: 5 },
      evidence: [interval(134, 142), interval(250, 260)],
    }),
    check('frozen_frames', 'WARNING', { evidence: [{ timestamp: 492, measuredValue: null }] }),
    check('speech_vad', 'WARNING', { messageCode: 'analysis.speech_vad.unsupported' }),
    check('blur', 'WARNING', { messageCode: 'analysis.blur.noSamples' }),
    check('scene_cuts', 'ERROR'),
    check('audio_clipping', 'SKIPPED', { messageCode: 'analysis.common.disabled' }),
    check('audio_loudness', 'SKIPPED'),
  ], { conclusion: 'REJECT' });
  assert.match(caption, /❌ Тишина.*8 с \(≤ 5 с\)/);
  assert.match(caption, /t=134s">02:14<\/a>–<a .*t=142s">02:22<\/a>/);
  assert.match(caption, /t=250s.*t=260s/);
  assert.match(caption, /t=492s">08:12<\/a>/);
  assert.match(caption, /Речь — не реализовано/);
  assert.match(caption, /Резкость — недостаточно данных/);
  assert.match(caption, /⚠️ Склейки — ошибка выполнения/);
  assert.match(caption, /➖ Перегрузка звука — отключено/);
  assert.match(caption, /➖ Громкость — пропущено/);
  assert.match(caption, /Общий результат: Отклонено/);
});

test('bounds the caption, keeps all checks, and only shortens the event list', () => {
  const checks = Object.keys(DEFAULT_PROFILE_CRITERIA).map(type => check(type, 'WARNING'));
  checks[2] = check('audio_silence', 'FAIL', {
    evidence: Array.from({ length: 2000 }, (_, index) => interval(10 + index * 20, 18 + index * 20)),
  });
  for (const language of ['ru', 'en']) {
    const { caption } = format(checks, { title: '😀&<'.repeat(500), language });
    assert.ok(visible(caption).length <= 1024);
    assert.equal(caption.split('\n').filter(line => /^(✅|⚠️|❌|➖) /.test(line)).length, 13);
    const shown = caption.split('\n').filter(line => line.startsWith('🔴 ')).length;
    assert.ok(shown >= 5 && shown <= 8);
    assert.ok(caption.includes(String(2000 - shown)));
  }
});

test('escapes titles, uses plain times on other hosts and keeps the TXT unchanged', () => {
  const { caption, document } = format([
    check('audio_silence', 'FAIL', { evidence: [interval(134, 142)] }),
  ], { title: 'A <B> & "C"_*', url: 'https://youtube.com.example/video', language: 'en', conclusion: 'REJECT' });
  assert.match(caption, /A &lt;B&gt; &amp; &quot;C&quot;_\*/);
  assert.match(caption, /02:14–02:22 — Silence/);
  assert.doesNotMatch(caption, /<a /);
  assert.equal(document, [
    'A <B> & "C"_*',
    'https://youtube.com.example/video',
    'Profile: Base, version 2',
    'Overall result: Rejected',
    'Checks: Passed: 0 · Failed: 1 · Warnings: 0 · Errors: 0 · Skipped: 0',
    '',
    'audio_silence: Failed',
    'internal diagnostic',
    'Measured: null',
    'Expected: null',
    'Timecodes',
    '00:02:14.000  silence  Evidence  {"start":134,"end":142}',
    '',
  ].join('\n'));
});

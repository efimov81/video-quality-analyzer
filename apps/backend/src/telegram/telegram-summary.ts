import type { AnalysisService } from '../analysis/analysis.service';
import type { CheckType } from '../analysis/profile-criteria';
import { telegramMessages, type TelegramLanguage } from './telegram-messages';

type Report = Awaited<ReturnType<AnalysisService['report']>>;
type Check = Report['checks'][number];
const captionLimit = 1024;
const icons = { PASS: '✅', FAIL: '❌', WARNING: '⚠️', ERROR: '⚠️', SKIPPED: '➖' };
const labels = {
  resolution: ['Разрешение', 'Resolution'],
  audio_presence: ['Звуковая дорожка', 'Audio track'],
  audio_silence: ['Тишина', 'Silence'],
  scene_cuts: ['Склейки', 'Cuts'],
  audio_loudness: ['Громкость', 'Loudness'],
  audio_clipping: ['Перегрузка звука', 'Clipping'],
  background_noise: ['Фоновый шум', 'Background noise'],
  speech_vad: ['Речь', 'Speech'],
  visual_brightness: ['Яркость', 'Brightness'],
  blur: ['Резкость', 'Sharpness'],
  black_screens: ['Чёрные экраны', 'Black screens'],
  frozen_frames: ['Зависания', 'Frozen frames'],
  upscaling_experimental: ['Апскейл', 'Upscaling'],
} satisfies Record<CheckType, [string, string]>;

const html = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const numeric = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function shortText(text: string, limit: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= limit) return line;
  return line.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, '') + '…';
}

function time(seconds: number, includeMilliseconds = false): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  const clock = (hours ? [hours, minutes, whole % 60] : [minutes, whole % 60])
    .map((part) => String(part).padStart(2, '0')).join(':');
  const fractional = Math.min(999, Math.round((seconds - whole) * 1000));
  return includeMilliseconds && fractional ? clock + '.' + String(fractional).padStart(3, '0') : clock;
}

function youtubeId(source: string): string | undefined {
  if (!URL.canParse(source)) return;
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol)) return;
  const host = url.hostname;
  const [, prefix, pathId] = url.pathname.split('/');
  let id: string | null | undefined;
  if (host === 'youtu.be' || host === 'www.youtu.be') id = prefix;
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    id = prefix === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(prefix) ? pathId : undefined;
  } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host) && prefix === 'embed') id = pathId;
  return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}

function describe(check: Check, ru: boolean) {
  const measured = record(check.measuredValue);
  const expected = record(check.expectedValue);
  const code = check.messageCode ?? '';
  const status = check.status;
  const tr = (a: string, b: string) => ru ? a : b;
  const measuredNumber = (key: string) => numeric(measured[key]);
  const expectedNumber = (key: string) => numeric(expected[key]);
  const metric = (value: number | undefined, limit: number | undefined, unit = '', bound = '≤', factor = 1) =>
    value === undefined ? '' : `${Number((value * factor).toFixed(2))}${unit}${limit === undefined ? '' : ` (${bound} ${Number((limit * factor).toFixed(2))}${unit})`}`;
  if (status === 'ERROR') return { result: tr('ошибка выполнения', 'execution error'), metric: '' };
  if (status === 'SKIPPED') return {
    result: code.endsWith('.disabled') ? tr('отключено', 'disabled') : tr('пропущено', 'skipped'), metric: '',
  };
  if (code.endsWith('.unsupported') || code.endsWith('.unregistered') ||
    (status === 'WARNING' && ['speech_vad', 'upscaling_experimental'].includes(check.checkType))) {
    return { result: tr('не реализовано', 'unavailable'), metric: '' };
  }

  let result = status === 'PASS' ? tr('в норме', 'passed') :
    status === 'FAIL' ? tr('вне нормы', 'failed') : tr('нужна проверка', 'review needed');
  let value = '';
  switch (check.checkType) {
    case 'resolution': {
      const w = measuredNumber('width'), h = measuredNumber('height');
      const minW = expectedNumber('minWidth'), minH = expectedNumber('minHeight');
      const duration = measuredNumber('durationSec');
      const minDuration = expectedNumber('minDurationSec'), maxDuration = expectedNumber('maxDurationSec');
      const ratio = measuredNumber('aspectRatio'), minRatio = expectedNumber('minAspectRatio'), maxRatio = expectedNumber('maxAspectRatio');
      if (code.endsWith('.noVideo')) result = tr('нет видео', 'no video');
      else if (duration !== undefined && minDuration !== undefined && duration < minDuration)
        value = metric(duration, minDuration, tr(' с', ' s'), '≥');
      else if (duration !== undefined && maxDuration !== undefined && duration > maxDuration)
        value = metric(duration, maxDuration, tr(' с', ' s'));
      else if (ratio !== undefined && minRatio !== undefined && ratio < minRatio)
        value = tr('Пропорции ', 'Aspect ratio ') + metric(ratio, minRatio, '', '≥');
      else if (ratio !== undefined && maxRatio !== undefined && ratio > maxRatio)
        value = tr('Пропорции ', 'Aspect ratio ') + metric(ratio, maxRatio);
      else if (measuredNumber('videoBitrateBps') !== undefined &&
        expectedNumber('minVideoBitrateBps') !== undefined && measuredNumber('videoBitrateBps')! < expectedNumber('minVideoBitrateBps')!)
        value = metric(measuredNumber('videoBitrateBps'), expectedNumber('minVideoBitrateBps'), tr(' бит/с', ' bps'), '≥');
      else if (w !== undefined && h !== undefined && minW !== undefined && minH !== undefined)
        value = `${w}×${h} (≥ ${minW}×${minH})`;
      break;
    }
    case 'audio_presence': {
      const count = measuredNumber('audioStreamCount');
      if (count !== undefined) result = count ? tr('присутствует', 'present') : tr('отсутствует', 'absent');
      if (count !== undefined) value = metric(count, expected.required === true ? 1 : undefined, tr(' дор.', ' track(s)'), '≥');
      break;
    }
    case 'audio_silence':
      if (code.endsWith('.zeroSignal')) result = tr('нет сигнала', 'no signal');
      value = metric(measuredNumber('longestSilenceSec'), expectedNumber('maxSegmentSec'), tr(' с', ' s'));
      break;
    case 'scene_cuts': {
      const count = measuredNumber('cutCount'), frequent = measuredNumber('frequentCutCount');
      if (count !== undefined && frequent !== undefined) value = tr(`${count} перех., ${frequent} коротк.`, `${count} cuts, ${frequent} short`);
      const min = expectedNumber('minIntervalSec'), max = expectedNumber('maxFrequentCuts');
      if (value && min !== undefined && max !== undefined) value += tr(` (< ${min} с, допуск ${max})`, ` (< ${min} s, max ${max})`);
      if (frequent !== undefined && frequent > 0) result = tr('есть короткие', 'short cuts found');
      break;
    }
    case 'audio_loudness': {
      const loudness = measuredNumber('inputIntegratedLufs');
      const min = expectedNumber('minIntegratedLufs'), max = expectedNumber('maxIntegratedLufs');
      const peak = metric(measuredNumber('inputTruePeakDbtp'), expectedNumber('maxTruePeakDbtp'), ' dBTP');
      const integrated = metric(loudness, undefined, ' LUFS') +
        (loudness !== undefined && min !== undefined && max !== undefined ? ` (${min}…${max})` : '');
      value = [integrated, peak].filter(Boolean).join('; ');
      break;
    }
    case 'audio_clipping': value = metric(measuredNumber('fullScaleSampleRatio'), expectedNumber('maxFullScaleSampleRatio'), '%', '≤', 100); break;
    case 'visual_brightness': value = metric(measuredNumber('problemFrameRatio'), expectedNumber('maxProblemFrameRatio'), '%', '≤', 100); break;
    case 'blur': value = metric(measuredNumber('medianFfmpegBlurMetric'), expectedNumber('maxFfmpegBlurMetric')); break;
    case 'background_noise':
      return { result: tr('помехи не оценены', 'noise impact unassessed'), metric: '' };
    case 'black_screens':
    case 'frozen_frames': {
      const count = measuredNumber('segmentCount'), min = expectedNumber('minDurationSec');
      if (count !== undefined) {
        result = count === 0 ? tr('нет', 'none') : tr('обнаружены', 'found');
        value = tr(`${count} инт.`, `${count} segment(s)`);
        if (min !== undefined) value += tr(` (от ${min} с)`, ` (from ${min} s)`);
      }
      break;
    }
  }
  if (/\.(?:noSamples|noThreshold|unavailable|rmsUnavailable|incompleteMetadata)$/.test(code)) {
    result = code.endsWith('.noThreshold') ? tr('порог не задан', 'no threshold set') : tr('недостаточно данных', 'insufficient data');
  }
  return { result, metric: value };
}

interface Event {
  label: string;
  start: number;
  end?: number;
  failed: boolean;
}

function eventsFor(check: Check, label: string): Event[] {
  if (check.status === 'PASS' || check.status === 'ERROR' || check.status === 'SKIPPED') return [];
  const failed = check.status === 'FAIL';
  const toEvent = (entry: unknown, timestamp?: unknown): Event[] => {
    const data = record(entry);
    const start = numeric(data.start) ?? numeric(data.from) ?? numeric(timestamp) ?? numeric(data.timestamp);
    const end = numeric(data.end) ?? numeric(data.to);
    return start !== undefined && start >= 0 ? [{ label, start, end: end !== undefined && end > start ? end : undefined, failed }] : [];
  };
  const evidence = check.evidence.flatMap((entry) => toEvent(entry.measuredValue, entry.timestamp));
  const measured = record(check.measuredValue);
  const expected = record(check.expectedValue);
  let records: unknown = measured.segments;
  if (check.checkType === 'visual_brightness') records = measured.timestamps;
  if (check.checkType === 'scene_cuts' && Array.isArray(measured.intervals)) {
    const minimum = numeric(expected.minIntervalSec);
    records = measured.intervals.filter((interval) => (numeric(record(interval).seconds) ?? Infinity) < (minimum ?? 0));
  }
  if (check.checkType === 'blur' && Array.isArray(measured.worstFrames)) {
    const maximum = numeric(expected.maxFfmpegBlurMetric);
    records = measured.worstFrames.filter((sample) => (numeric(record(sample).value) ?? -Infinity) > (maximum ?? Infinity));
  }
  const combined = Array.isArray(records) ? [...evidence, ...records.flatMap((entry) => toEvent(entry))] : evidence;
  const silenceLimit = check.checkType === 'audio_silence' ? numeric(expected.maxSegmentSec) : undefined;
  const suspicious = silenceLimit === undefined || check.messageCode?.endsWith('.zeroSignal') ? combined
    : combined.filter(({ start, end }) => end === undefined || end - start > silenceLimit);
  return [...new Map(suspicious.map((event) => [`${event.start}/${event.end}`, event])).values()];
}

interface Line { text: string; markup?: string }

export function formatTelegramSummary(report: Report, language: TelegramLanguage): string {
  const ru = language === 'ru';
  const messages = telegramMessages[language];
  const tr = (a: string, b: string) => ru ? a : b;
  const bold = (text: string): Line => ({ text, markup: `<b>${html(text)}</b>` });
  const id = youtubeId(report.video.sourceUrl);
  const link = (text: string, seconds?: number): string => id
    ? `<a href="https://www.youtube.com/watch?v=${id}${seconds === undefined ? '' : `&amp;t=${Math.floor(seconds)}s`}">${html(text)}</a>`
    : html(text);
  const resolution = record(report.checks.find((check) => check.checkType === 'resolution')?.measuredValue);
  const duration = numeric(resolution.durationSec) ?? numeric(record(
    report.checks.find((check) => check.checkType === 'audio_silence')?.measuredValue,
  ).durationSec);
  const width = numeric(resolution.width), height = numeric(resolution.height);
  const title = shortText(report.video.title || report.video.sourceUrl, 90) || tr('Видео', 'Video');
  const profileName = typeof report.profile.name === 'string' ? shortText(report.profile.name, 38) : '';
  const profileVersion = numeric(report.profile.version);
  const metadata = [
    duration !== undefined && duration >= 0 ? tr('Длительность', 'Duration') + ' ' + time(duration) : '',
    width && height ? `${width}×${height}` : '',
  ].filter(Boolean).join(' · ');
  const header: Line[] = [
    bold(tr('🎬 Анализ видео завершён', '🎬 Video analysis complete')),
    { text: title, markup: link(title) },
    ...(metadata ? [{ text: metadata }] : []),
    ...(profileName ? [{ text: `${messages.profile}: ${profileName}${profileVersion === undefined ? '' : ` · v${profileVersion}`}` }] : []),
    { text: `${messages.verdict}: ${messages.conclusions[report.conclusion]}` },
    bold(tr('📊 Результаты проверок', '📊 Check results')),
  ];
  const checks = report.checks.map((check) => {
    const label = labels[check.checkType as CheckType]?.[ru ? 0 : 1] ?? tr('Другая проверка', 'Other check');
    return { check, label, ...describe(check, ru) };
  });
  const counts = { PASS: 0, FAIL: 0, WARNING: 0, ERROR: 0, SKIPPED: 0 };
  for (const { check } of checks) counts[check.status]++;
  const footer: Line[] = [
    bold(tr('Итого', 'Total') + `: ✅ ${counts.PASS} | ❌ ${counts.FAIL} | ⚠️ ${counts.WARNING}` +
      (counts.ERROR ? tr(` | ошибок: ${counts.ERROR}`, ` | errors: ${counts.ERROR}`) : '') +
      (counts.SKIPPED ? ` | ➖ ${counts.SKIPPED}` : '')),
    { text: `📎 ${messages.report}` },
  ];
  const events = checks.flatMap(({ check, label }) => eventsFor(check, label))
    .sort((a, b) => Number(b.failed) - Number(a.failed) || a.start - b.start);
  const rows = checks.map(({ check, label, result }) => ({ text: `${icons[check.status]} ${label} — ${result}` }));
  const timeline: Line[] = [];
  const omitted = (count: number): Line => ({ text: tr(`Ещё ${count} в отчёте`, `${count} more in report`) });
  const lines = (): Line[] => [
    ...header, ...rows, ...timeline,
    ...(events.length && timeline.length - 1 < events.length ? [omitted(events.length - Math.max(0, timeline.length - 1))] : []),
    ...footer,
  ];
  const fits = () => lines().map(({ text }) => text).join('\n').length <= captionLimit;
  const addEvents = (limit: number) => {
    if (!events.length) return;
    if (!timeline.length) timeline.push(bold(tr('📍 Подозрительные участки', '📍 Points to review')));
    for (const event of events.slice(timeline.length - 1, limit)) {
      const start = time(event.start, true), end = event.end === undefined ? '' : time(event.end, true);
      const icon = event.failed ? '🔴' : '🟡';
      const range = end ? `${start}–${end}` : start;
      timeline.push({
        text: `${icon} ${range} — ${event.label}`,
        markup: `${icon} ${link(start, event.start)}${end ? `–${link(end, event.end)}` : ''} — ${html(event.label)}`,
      });
      if (!fits()) { timeline.pop(); break; }
    }
    if (timeline.length === 1) timeline.length = 0;
  };
  addEvents(5);
  for (const [index, check] of checks.entries()) {
    if (!check.metric) continue;
    const original = rows[index].text;
    rows[index].text += `, ${check.metric}`;
    if (!fits()) rows[index].text = original;
  }
  addEvents(8);
  // All current check rows fit; guard the transport if new checks increase the fixed part.
  if (!fits()) return html(shortText(lines().map(({ text }) => text).join('\n'), captionLimit));
  return lines().map(({ text, markup }) => markup ?? html(text)).join('\n');
}

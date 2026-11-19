import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PROFILE_CRITERIA = {
  resolution: { enabled: true, minWidth: 1920, minHeight: 1080, portraitAware: true, minAspectRatio: 0.3, maxAspectRatio: 2.4, minVideoBitrateBps: null, minDurationSec: 1, maxDurationSec: 21_600 },
  audio_presence: { enabled: true, required: true },
  audio_silence: { enabled: true, thresholdDb: -60, minSegmentSec: 2, maxSegmentSec: 30 },
  scene_cuts: { enabled: true, minIntervalSec: 5, maxFrequentCuts: 0, sensitivity: 3, dedupWindowSec: 1 },
  audio_loudness: { enabled: true, minIntegratedLufs: -35, maxIntegratedLufs: -8, maxTruePeakDbtp: -1 },
  audio_clipping: { enabled: true, maxClippedSampleRatio: 0.001 },
  background_noise: { enabled: true },
  speech_vad: { enabled: true },
  visual_brightness: { enabled: true, overexposedY: 250, darkY: 10, maxProblemFrameRatio: 0.1 },
  blur: { enabled: true, maxBlurMetric: null },
  black_screens: { enabled: true, minDurationSec: 0.5, pixelThreshold: 0.1 },
  frozen_frames: { enabled: true, minDurationSec: 2, noiseDb: -60 },
  upscaling_experimental: { enabled: true },
} as const;

export type CheckType = keyof typeof DEFAULT_PROFILE_CRITERIA;
export type ProfileCriteria = Record<CheckType, Record<string, unknown>>;

export function normalizeCriteria(value: unknown): ProfileCriteria {
  if (!isRecord(value)) throw new BadRequestException('criteria должен быть JSON-объектом.');

  const normalized = {} as ProfileCriteria;
  for (const [checkType, defaults] of Object.entries(DEFAULT_PROFILE_CRITERIA) as [CheckType, Record<string, unknown>][]) {
    const provided = value[checkType];
    if (provided !== undefined && !isRecord(provided)) {
      throw new BadRequestException(`Критерий ${checkType} должен быть объектом.`);
    }

    const rule = { ...defaults, ...(provided ?? {}) };
    for (const [key, item] of Object.entries(rule)) {
      if (!(key in defaults)) continue;
      const defaultValue = defaults[key];
      if (typeof defaultValue === 'boolean' && typeof item !== 'boolean') {
        throw new BadRequestException(`${checkType}.${key} должен быть boolean.`);
      }
      if (typeof defaultValue === 'number' && (typeof item !== 'number' || !Number.isFinite(item))) {
        throw new BadRequestException(`${checkType}.${key} должен быть числом.`);
      }
      if (defaultValue === null && item !== null && (typeof item !== 'number' || !Number.isFinite(item))) {
        throw new BadRequestException(`${checkType}.${key} должен быть числом или null.`);
      }
    }
    if (Object.values(rule).some((item) => typeof item === 'number' && item < 0) && checkType !== 'audio_loudness' && checkType !== 'frozen_frames' && checkType !== 'audio_silence') {
      throw new BadRequestException(`Критерий ${checkType} не может содержать отрицательные пороги.`);
    }
    const ratioKeys = checkType === 'audio_clipping' ? ['maxClippedSampleRatio'] : ['maxProblemFrameRatio'];
    for (const key of ratioKeys) {
      if (typeof rule[key] === 'number' && ((rule[key] as number) < 0 || (rule[key] as number) > 1)) {
        throw new BadRequestException(`${checkType}.${key} должен быть от 0 до 1.`);
      }
    }
    if (checkType === 'visual_brightness' && ((rule.darkY as number) >= (rule.overexposedY as number) || (rule.overexposedY as number) > 255)) {
      throw new BadRequestException('Пороги яркости должны быть согласованы и находиться в диапазоне 0–255.');
    }
    if (checkType === 'audio_loudness' && (rule.minIntegratedLufs as number) >= (rule.maxIntegratedLufs as number)) {
      throw new BadRequestException('minIntegratedLufs должен быть меньше maxIntegratedLufs.');
    }
    if (checkType === 'resolution' && ((rule.minAspectRatio as number) <= 0 || (rule.minAspectRatio as number) >= (rule.maxAspectRatio as number))) {
      throw new BadRequestException('Диапазон aspect ratio должен содержать положительные упорядоченные значения.');
    }
    if (checkType === 'scene_cuts' && ((rule.sensitivity as number) > 100 || (rule.maxFrequentCuts as number) % 1 !== 0 || (rule.dedupWindowSec as number) > 10)) {
      throw new BadRequestException('Параметры scene_cuts вне поддерживаемого диапазона.');
    }
    if (checkType === 'black_screens' && (rule.pixelThreshold as number) > 1) {
      throw new BadRequestException('black_screens.pixelThreshold должен быть от 0 до 1.');
    }
    normalized[checkType] = rule;
  }
  return normalized;
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function criterionNumber(criteria: ProfileCriteria, checkType: CheckType, key: string): number | null {
  const value = criteria[checkType][key];
  return typeof value === 'number' ? value : null;
}

export function criterionEnabled(criteria: ProfileCriteria, checkType: CheckType): boolean {
  return criteria[checkType].enabled === true;
}

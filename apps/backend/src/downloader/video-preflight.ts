import type { MessageParams } from '../common/api-message';
import { isRecord, resolutionLimits, type ProfileCriteria } from '../analysis/profile-criteria';

export const preflightStatuses = ['PASSED', 'REJECTED', 'INCONCLUSIVE', 'ERROR'] as const;
export type PreflightStatus = (typeof preflightStatuses)[number];
export interface PreflightCheck {
  check: 'availability' | 'duration' | 'shorts' | 'resolution';
  status: PreflightStatus | 'SKIPPED';
  reason: string;
  params: MessageParams;
}
export interface PreflightResult {
  status: PreflightStatus;
  checks: PreflightCheck[];
}

export interface VideoInfo {
  title?: string;
  description?: string;
}

export function youtubeUrl(source: string): URL | null {
  if (!URL.canParse(source)) return null;
  const url = new URL(source);
  const host = url.hostname.replace(/\.$/, '');
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be',
      'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host) ? url : null;
}

export function isShortsUrl(source: unknown): boolean {
  return typeof source === 'string' && /^\/shorts\/[\w-]{11}(?:\/|$)/.test(youtubeUrl(source)?.pathname ?? '');
}

export function preflightCheck(
  check: PreflightCheck['check'], status: PreflightCheck['status'], reason: string, params: MessageParams = {},
): PreflightCheck {
  return { check, status, reason, params };
}

export function preflightResult(checks: PreflightCheck[]): PreflightResult {
  const status = (['REJECTED', 'ERROR', 'INCONCLUSIVE'] as const).find((state) =>
    checks.some((check) => check.status === state)) ?? 'PASSED';
  const ordered = (['availability', 'duration', 'shorts', 'resolution'] as const).map((name) =>
    checks.find(({ check }) => check === name) ?? preflightCheck(name, 'SKIPPED', 'notChecked'));
  return { status, checks: ordered };
}

export function shortsUrlRejection(source: string, criteria: ProfileCriteria): PreflightResult | undefined {
  return criteria.resolution.allowShorts === false && isShortsUrl(source)
    ? preflightResult([preflightCheck('shorts', 'REJECTED', 'shortsForbidden')])
    : undefined;
}

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const restricted = new Set(['private', 'premium_only', 'subscriber_only', 'needs_auth']);

export function evaluateMetadata(metadata: Record<string, unknown>, criteria: ProfileCriteria): PreflightResult {
  if (metadata._type === 'playlist' || metadata._type === 'multi_video') {
    return preflightResult([preflightCheck('availability', 'REJECTED', 'notSingleVideo')]);
  }
  const limits = resolutionLimits(criteria);
  const availability = typeof metadata.availability === 'string' ? metadata.availability : '';
  const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
  const videos = formats.filter((format) => isRecord(format) && format.vcodec !== 'none' &&
    format.protocol !== 'mhtml' && format.ext !== 'mhtml');
  const known = videos.filter((format) => typeof format.vcodec === 'string' && format.vcodec.length > 0 &&
    number(format.width) && number(format.height));
  const supported = known.find((format) => limits.dimensionsPass(format.width as number, format.height as number));
  const videoFormatFound = videos.some((format) => typeof format.vcodec === 'string' && format.vcodec.length > 0);
  const access = restricted.has(availability)
    ? preflightCheck('availability', 'REJECTED', 'videoRestricted')
    : preflightCheck('availability', videoFormatFound ? 'PASSED' : 'INCONCLUSIVE', videoFormatFound ? 'available' : 'availabilityUnknown');
  const duration = number(metadata.duration);
  let durationCheck = preflightCheck('duration', 'SKIPPED', 'disabled');
  let resolutionCheck = preflightCheck('resolution', 'SKIPPED', 'disabled');
  if (criteria.resolution.enabled === true) {
    const range = { duration: duration ?? null, min: limits.minDuration, max: limits.maxDuration };
    durationCheck = duration === undefined ? preflightCheck('duration', 'INCONCLUSIVE', 'durationUnknown', range)
      : limits.durationPass(duration) ? preflightCheck('duration', 'PASSED', 'durationWithinLimits', range)
      : preflightCheck('duration', 'REJECTED', duration < limits.minDuration ? 'tooShort' : 'tooLong', range);
    const dimensions = { minWidth: limits.minWidth, minHeight: limits.minHeight, portraitAware: limits.portraitAware };
    if (supported) {
      resolutionCheck = preflightCheck('resolution', 'PASSED', 'formatAvailable', {
        ...dimensions, width: supported.width as number, height: supported.height as number,
      });
    } else if (known.length > 0 && known.length === videos.length && formats.every(isRecord)) {
      resolutionCheck = preflightCheck('resolution', 'REJECTED', 'resolutionTooLow', dimensions);
    } else {
      resolutionCheck = preflightCheck('resolution', 'INCONCLUSIVE', 'resolutionUnknown', dimensions);
    }
  }
  const shorts = metadata.is_short === true || isShortsUrl(metadata.webpage_url) || isShortsUrl(metadata.original_url);
  const shortsCheck = criteria.resolution.allowShorts === true ? preflightCheck('shorts', 'SKIPPED', 'shortsAllowed')
    : shorts ? preflightCheck('shorts', 'REJECTED', 'shortsForbidden')
    : metadata.is_short === false ? preflightCheck('shorts', 'PASSED', 'notShorts')
    : preflightCheck('shorts', 'INCONCLUSIVE', 'shortsUnknown');
  return preflightResult([access, durationCheck, shortsCheck, resolutionCheck]);
}

export function metadataFailure(message: string): PreflightResult {
  if (/private video|members-only|join this channel|not available in your country|blocked in your country|age.restricted|confirm your age/i.test(message)) {
    return preflightResult([preflightCheck('availability', 'REJECTED', 'videoRestricted')]);
  }
  if (/video (?:has been|was) removed|removed by (?:the )?uploader|this video has been deleted|this video is (?:no longer available|unavailable)|video unavailable/i.test(message)) {
    return preflightResult([preflightCheck('availability', 'REJECTED', 'videoUnavailable')]);
  }
  const reason = /ENOENT/.test(message) ? 'downloaderMissing'
    : /timed out|timeout/i.test(message) ? 'metadataTimeout' : 'metadataFailed';
  return preflightResult([preflightCheck('availability', 'ERROR', reason)]);
}

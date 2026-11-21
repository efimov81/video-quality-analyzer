import { Injectable } from '@nestjs/common';
import { AnalyzerInput, CheckResultInput, VideoAnalyzer } from '../analysis.models';
import { CheckType, criterionEnabled, criterionNumber } from '../profile-criteria';

const VERSION = 'ffprobe-metadata/1.0';

@Injectable()
export class MetadataAnalyzer implements VideoAnalyzer {
  readonly checkTypes: readonly CheckType[] = ['resolution'];

  async analyze(input: AnalyzerInput): Promise<CheckResultInput[]> {
    if (!input.media) throw new Error('FFprobe не предоставил метаданные видео.');
    const rule = input.criteria.resolution;
    const streams = input.media.streams.filter((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
    const video = streams[0];
    if (!video) {
      return [this.result('FAIL', null, { requiredVideoStream: true }, 'Видеопоток отсутствует.', 'analysis.resolution.noVideo')];
    }

    const width = video.width ?? 0;
    const height = video.height ?? 0;
    const portraitAware = rule.portraitAware === true;
    const measuredWidth = portraitAware ? Math.max(width, height) : width;
    const measuredHeight = portraitAware ? Math.min(width, height) : height;
    const duration = this.toNumber(video.duration ?? input.media.format.duration);
    const videoBitrate = this.toNumber(video.bit_rate);
    const aspectRatio = width && height ? width / height : null;
    const minWidth = criterionNumber(input.criteria, 'resolution', 'minWidth') ?? 1920;
    const minHeight = criterionNumber(input.criteria, 'resolution', 'minHeight') ?? 1080;
    const minDuration = criterionNumber(input.criteria, 'resolution', 'minDurationSec') ?? 1;
    const maxDuration = criterionNumber(input.criteria, 'resolution', 'maxDurationSec') ?? 21600;
    const minBitrate = criterionNumber(input.criteria, 'resolution', 'minVideoBitrateBps');
    const minAspectRatio = criterionNumber(input.criteria, 'resolution', 'minAspectRatio') ?? 0.3;
    const maxAspectRatio = criterionNumber(input.criteria, 'resolution', 'maxAspectRatio') ?? 2.4;
    const dimensionsPass = measuredWidth >= minWidth && measuredHeight >= minHeight;
    const durationPass = duration !== null && duration >= minDuration && duration <= maxDuration;
    const aspectRatioPass = aspectRatio !== null && aspectRatio >= minAspectRatio && aspectRatio <= maxAspectRatio;
    const bitrateKnown = videoBitrate !== null;
    const bitratePass = minBitrate === null || (bitrateKnown && videoBitrate! >= minBitrate);
    const status = dimensionsPass && durationPass && aspectRatioPass && bitratePass
      ? 'PASS'
      : (!dimensionsPass || (duration !== null && !durationPass) || (aspectRatio !== null && !aspectRatioPass) || (bitrateKnown && !bitratePass) ? 'FAIL' : 'WARNING');
    const measured = {
      width,
      height,
      normalizedWidth: measuredWidth,
      normalizedHeight: measuredHeight,
      aspectRatio: aspectRatio === null ? null : Number(aspectRatio.toFixed(4)),
      durationSec: duration,
      videoBitrateBps: videoBitrate,
      containerBitrateBps: this.toNumber(input.media.format.bit_rate),
      codec: video.codec_name ?? null,
      videoStreamCount: streams.length,
      fps: this.parseFrameRate(video.avg_frame_rate ?? video.r_frame_rate),
      format: input.media.format.format_name ?? null,
    };
    const expected = {
      minWidth,
      minHeight,
      portraitAware,
      minAspectRatio,
      maxAspectRatio,
      minDurationSec: minDuration,
      maxDurationSec: maxDuration,
      minVideoBitrateBps: minBitrate,
    };
    const details = status === 'PASS'
      ? 'Разрешение и длительность соответствуют профилю.'
      : status === 'FAIL'
        ? 'Разрешение или длительность не соответствуют профилю.'
        : 'Разрешение измерено, но часть метаданных для критерия отсутствует.';
    const messageCode = status === 'PASS' ? 'analysis.resolution.pass'
      : status === 'FAIL' ? 'analysis.resolution.outsideLimits'
        : 'analysis.resolution.incompleteMetadata';
    return [this.result(status, measured, expected, details, messageCode)];
  }

  private result(status: CheckResultInput['status'], measuredValue: unknown, expectedValue: unknown, details: string, messageCode: string): CheckResultInput {
    return { checkType: 'resolution', status, measuredValue, expectedValue, details, messageCode, messageParams: {}, analyzerVersion: VERSION };
  }

  private toNumber(value: string | undefined): number | null {
    if (value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseFrameRate(value: string | undefined): number | null {
    if (!value) return null;
    const [numerator, denominator] = value.split('/').map(Number);
    if (!denominator) return null;
    const fps = numerator / denominator;
    return Number.isFinite(fps) ? Number(fps.toFixed(3)) : null;
  }
}

import { Injectable } from '@nestjs/common';
import { AnalyzerInput, CheckResultInput, VideoAnalyzer } from '../analysis.models';
import { CheckType, criterionNumber } from '../profile-criteria';
import { MediaToolsService } from '../media-tools.service';

const VERSION = 'ffmpeg-visual-metrics/1.0';

interface VisualSample {
  timestamp: number;
  averageLuma: number | null;
  maximumLuma: number | null;
  blurMetric: number | null;
}

@Injectable()
export class VisualAnalyzer implements VideoAnalyzer {
  readonly checkTypes: readonly CheckType[] = ['visual_brightness', 'blur', 'black_screens', 'frozen_frames'];

  constructor(private readonly tools: MediaToolsService) {}

  async analyze(input: AnalyzerInput): Promise<CheckResultInput[]> {
    if (!input.media?.streams.some((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1)) {
      throw new Error('Видеопоток не найден.');
    }
    const blackRule = input.criteria.black_screens;
    const freezeRule = input.criteria.frozen_frames;
    const blackDuration = criterionNumber(input.criteria, 'black_screens', 'minDurationSec') ?? 0.5;
    const pixelThreshold = criterionNumber(input.criteria, 'black_screens', 'pixelThreshold') ?? 0.1;
    const freezeDuration = criterionNumber(input.criteria, 'frozen_frames', 'minDurationSec') ?? 2;
    const freezeNoise = criterionNumber(input.criteria, 'frozen_frames', 'noiseDb') ?? -60;
    const filters = [
      `blackdetect=d=${blackDuration}:pix_th=${pixelThreshold}`,
      `freezedetect=n=${freezeNoise}dB:d=${freezeDuration}`,
      'fps=1', 'signalstats', 'blurdetect', 'metadata=print',
    ].join(',');
    const output = await this.tools.ffmpeg(input.filePath, [
      '-map', '0:v:0', '-vf', filters, '-an', '-f', 'null', '-',
    ]);
    const samples = this.parseSamples(output.stderr);
    const duration = Number(input.media!.format.duration ?? 0);
    const blackSegments = this.parseSegments(output.stderr, 'black', duration);
    const freezeSegments = this.parseSegments(output.stderr, 'freeze', duration);
    return [
      this.brightnessResult(samples, input),
      this.blurResult(samples, input),
      this.blackResult(blackSegments, blackRule, blackDuration),
      this.freezeResult(freezeSegments, freezeRule, freezeDuration),
    ];
  }

  private brightnessResult(samples: VisualSample[], input: AnalyzerInput): CheckResultInput {
    const rule = input.criteria.visual_brightness;
    const overexposedY = criterionNumber(input.criteria, 'visual_brightness', 'overexposedY') ?? 250;
    const darkY = criterionNumber(input.criteria, 'visual_brightness', 'darkY') ?? 10;
    const maxRatio = criterionNumber(input.criteria, 'visual_brightness', 'maxProblemFrameRatio') ?? 0.1;
    const overexposed = samples.filter((sample) => sample.averageLuma !== null && sample.averageLuma >= overexposedY);
    const dark = samples.filter((sample) => sample.averageLuma !== null && sample.averageLuma <= darkY);
    const problematicCount = overexposed.length + dark.length;
    const ratio = samples.length ? problematicCount / samples.length : 0;
    return {
      checkType: 'visual_brightness',
      status: samples.length === 0 ? 'WARNING' : ratio > maxRatio ? 'FAIL' : 'PASS',
      measuredValue: {
        sampledFrames: samples.length,
        overexposedFrameCount: overexposed.length,
        darkFrameCount: dark.length,
        problemFrameRatio: ratio,
        timestamps: [...overexposed, ...dark].slice(0, 200).map((sample) => ({ timestamp: sample.timestamp, averageLuma: sample.averageLuma })),
      },
      expectedValue: { overexposedY, darkY, maxProblemFrameRatio: maxRatio, samplingRateFps: 1 },
      details: samples.length ? 'Измерены средняя яркость кадров и доля кадров с экстремальной яркостью. Мгновенные пересветы между выборками могут быть пропущены.' : 'Не удалось получить выборки яркости кадров.',
      analyzerVersion: VERSION,
      evidence: [...overexposed, ...dark].slice(0, 200).map((sample) => ({ timestamp: sample.timestamp, problemType: sample.averageLuma! >= overexposedY ? 'overexposed_frame' : 'dark_frame', measuredValue: { averageLuma: sample.averageLuma }, details: `Средняя яркость кадра: ${sample.averageLuma}.` })),
    };
  }

  private blurResult(samples: VisualSample[], input: AnalyzerInput): CheckResultInput {
    const metrics = samples.flatMap((sample) => sample.blurMetric === null ? [] : [{ timestamp: sample.timestamp, value: sample.blurMetric }]);
    const sorted = metrics.map((metric) => metric.value).sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const configuredMax = criterionNumber(input.criteria, 'blur', 'maxBlurMetric');
    const status = median === null ? 'WARNING' : configuredMax === null ? 'WARNING' : median > configuredMax ? 'FAIL' : 'PASS';
    const worst = [...metrics].sort((a, b) => b.value - a.value).slice(0, 20);
    return {
      checkType: 'blur',
      status,
      measuredValue: { sampledFrames: metrics.length, medianFfmpegBlurMetric: median, maxFfmpegBlurMetric: sorted.length ? sorted[sorted.length - 1] : null, worstFrames: worst },
      expectedValue: { maxFfmpegBlurMetric: configuredMax, samplingRateFps: 1 },
      details: configuredMax === null
        ? 'FFmpeg blurdetect измерил blur metric; для FAIL нужен откалиброванный порог профиля. Универсальный порог не применяется.'
        : 'Blur metric сравнен с порогом профиля; показатель чувствителен к разрешению, содержимому и сборке FFmpeg.',
      analyzerVersion: VERSION,
      evidence: configuredMax === null ? [] : worst.filter((sample) => sample.value > configuredMax).map((sample) => ({ timestamp: sample.timestamp, problemType: 'blur_metric_above_threshold', measuredValue: sample.value, details: `FFmpeg blur metric ${sample.value} превышает порог ${configuredMax}.` })),
    };
  }

  private blackResult(segments: Array<{ start: number; end: number; duration: number }>, rule: Record<string, unknown>, minDuration: number): CheckResultInput {
    const status = segments.length ? 'FAIL' : 'PASS';
    return {
      checkType: 'black_screens', status,
      measuredValue: { segmentCount: segments.length, segments },
      expectedValue: { minDurationSec: minDuration, pixelThreshold: rule.pixelThreshold },
      details: segments.length ? `Обнаружены чёрные экраны длительностью не менее ${minDuration} с.` : 'Чёрные экраны заданной длительности не обнаружены.',
      analyzerVersion: VERSION,
      evidence: segments.map((segment) => ({ timestamp: segment.start, problemType: 'black_screen', measuredValue: segment, details: `Чёрный экран: ${segment.duration.toFixed(2)} с.` })),
    };
  }

  private freezeResult(segments: Array<{ start: number; end: number; duration: number }>, rule: Record<string, unknown>, minDuration: number): CheckResultInput {
    const status = segments.length ? 'WARNING' : 'PASS';
    return {
      checkType: 'frozen_frames', status,
      measuredValue: { segmentCount: segments.length, segments },
      expectedValue: { minDurationSec: minDuration, noiseDb: rule.noiseDb },
      details: segments.length ? 'Обнаружены интервалы почти неизменного изображения; статичная сцена может быть намеренной.' : 'Длительные замороженные участки не обнаружены.',
      analyzerVersion: VERSION,
      evidence: segments.map((segment) => ({ timestamp: segment.start, problemType: 'frozen_frame', measuredValue: segment, details: `Кадр почти неизменен ${segment.duration.toFixed(2)} с.` })),
    };
  }

  private parseSamples(stderr: string): VisualSample[] {
    const frames = stderr.split(/(?=frame:\s*\d+)/);
    return frames.flatMap((frame) => {
      const timestamp = this.metric(frame, 'pts_time');
      if (timestamp === null) return [];
      return [{
        timestamp,
        averageLuma: this.metric(frame, 'lavfi.signalstats.YAVG'),
        maximumLuma: this.metric(frame, 'lavfi.signalstats.YHIGH'),
        blurMetric: this.metric(frame, 'lavfi.blur'),
      }];
    });
  }

  private parseSegments(stderr: string, kind: 'black' | 'freeze', mediaDuration: number): Array<{ start: number; end: number; duration: number }> {
    const lines = stderr.split(/\r?\n/);
    const segments: Array<{ start: number; end: number; duration: number }> = [];
    let start: number | null = null;
    for (const line of lines) {
      if (kind === 'black') {
        const blackStart = line.match(/black_start:\s*([\d.]+)/);
        if (blackStart) start = Number(blackStart[1]);
        const blackEnd = line.match(/black_end:\s*([\d.]+)/);
        const blackDuration = line.match(/black_duration:\s*([\d.]+)/);
        if (blackEnd && blackDuration && start !== null) {
          segments.push({ start, end: Number(blackEnd[1]), duration: Number(blackDuration[1]) });
          start = null;
        }
      } else {
        const freezeStart = line.match(/freeze_start:\s*([\d.]+)/);
        if (freezeStart) start = Number(freezeStart[1]);
        const freezeEnd = line.match(/freeze_end:\s*([\d.]+)/);
        const freezeDuration = line.match(/freeze_duration:\s*([\d.]+)/);
        if (freezeEnd && freezeDuration && start !== null) {
          segments.push({ start, end: Number(freezeEnd[1]), duration: Number(freezeDuration[1]) });
          start = null;
        }
      }
    }
    if (start !== null && mediaDuration >= start) segments.push({ start, end: mediaDuration, duration: mediaDuration - start });
    return segments;
  }

  private metric(text: string, key: string): number | null {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}(?:=|:)\\s*(-?[\\d.]+)`));
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
}

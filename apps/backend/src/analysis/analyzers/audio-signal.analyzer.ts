import { Injectable } from '@nestjs/common';
import { AnalyzerInput, CheckResultInput, VideoAnalyzer } from '../analysis.models';
import { CheckType, criterionNumber } from '../profile-criteria';
import { MediaToolsService } from '../media-tools.service';

const VERSION = 'ffmpeg-audio-signals/1.0';

interface SilenceSegment { start: number; end: number; duration: number }

@Injectable()
export class AudioSignalAnalyzer implements VideoAnalyzer {
  readonly checkTypes: readonly CheckType[] = ['audio_silence', 'audio_loudness', 'background_noise', 'speech_vad'];

  constructor(private readonly tools: MediaToolsService) {}

  async analyze(input: AnalyzerInput): Promise<CheckResultInput[]> {
    if (!input.media) throw new Error('FFprobe не предоставил метаданные потоков.');
    if (!input.media.streams.some((stream) => stream.codec_type === 'audio')) {
      const skipped: CheckResultInput[] = this.checkTypes.filter((type) => type !== 'speech_vad').map((checkType) => ({
        checkType,
        status: 'SKIPPED',
        measuredValue: null,
        expectedValue: null,
        details: 'Проверка пропущена: аудиопоток отсутствует.',
        analyzerVersion: VERSION,
      }));
      skipped.push({
        checkType: 'speech_vad', status: 'WARNING', measuredValue: null, expectedValue: null,
        details: 'VAD не поддерживается: достоверная проверка речи без специализированной валидированной модели не выполняется.',
        analyzerVersion: 'unsupported/1.0',
      });
      return skipped;
    }

    const thresholdDb = criterionNumber(input.criteria, 'audio_silence', 'thresholdDb') ?? -60;
    const minimumSilence = criterionNumber(input.criteria, 'audio_silence', 'minSegmentSec') ?? 2;
    const filter = `astats=metadata=0:reset=0,silencedetect=noise=${thresholdDb}dB:d=${minimumSilence},loudnorm=I=-23:TP=-1.5:LRA=11:print_format=json`;
    const output = await this.tools.ffmpeg(input.filePath, [
      '-map', '0:a:0', '-af', filter, '-f', 'null', '-',
    ]);
    const duration = this.toNumber(input.media.format.duration) ?? 0;
    const intervals = this.parseSilenceSegments(output.stderr, duration);
    const rmsDb = this.parseAstats(output.stderr, 'RMS level dB');
    const peakDb = this.parseAstats(output.stderr, 'Peak level dB');
    const noiseFloorDb = this.parseAstats(output.stderr, 'Noise floor dB');
    const loudness = this.parseLoudness(output.stderr);
    const longestSilence = Math.max(0, ...intervals.map((segment) => segment.duration));
    const silenceDuration = Math.min(duration, intervals.reduce((sum, segment) => sum + segment.duration, 0));
    const zeroSignal = rmsDb === Number.NEGATIVE_INFINITY;
    const unknownSignal = rmsDb === null;
    const maxSilence = criterionNumber(input.criteria, 'audio_silence', 'maxSegmentSec') ?? 30;
    const silenceStatus = zeroSignal || longestSilence > maxSilence ? 'FAIL' : unknownSignal ? 'WARNING' : 'PASS';
    const silenceResult: CheckResultInput = {
      checkType: 'audio_silence',
      status: silenceStatus,
      measuredValue: { rmsDb, durationSec: duration, silenceThresholdDb: thresholdDb, totalDetectedSilenceSec: silenceDuration, silenceRatio: duration ? Number((silenceDuration / duration).toFixed(4)) : null, longestSilenceSec: longestSilence, segments: intervals },
      expectedValue: { thresholdDb, minSegmentSec: minimumSilence, maxSegmentSec: maxSilence, zeroSignal: false },
      details: zeroSignal ? 'Аудиопоток декодируется, но содержит нулевой сигнал на всей длительности.' : silenceStatus === 'FAIL' ? 'Обнаружена чрезмерно длинная тишина.' : unknownSignal ? 'Не удалось вычислить RMS; пороговая тишина измерена, но наличие сигнала требует ручной проверки.' : 'Проверка пороговой тишины завершена.',
      analyzerVersion: VERSION,
      evidence: intervals.map((segment) => ({ timestamp: segment.start, problemType: 'silence', measuredValue: segment, details: `Тишина длится ${segment.duration.toFixed(2)} с.` })),
    };

    const loudnessStatus = loudness === null ? 'WARNING' : this.loudnessStatus(loudness, input);
    const loudnessResult: CheckResultInput = {
      checkType: 'audio_loudness',
      status: loudnessStatus,
      measuredValue: loudness,
      expectedValue: {
        minIntegratedLufs: criterionNumber(input.criteria, 'audio_loudness', 'minIntegratedLufs'),
        maxIntegratedLufs: criterionNumber(input.criteria, 'audio_loudness', 'maxIntegratedLufs'),
        maxTruePeakDbtp: criterionNumber(input.criteria, 'audio_loudness', 'maxTruePeakDbtp'),
      },
      details: loudness ? loudnessStatus === 'PASS' ? 'Громкость и true peak находятся в пределах профиля.' : 'Громкость или true peak выходят за пределы профиля.' : 'FFmpeg не смог вычислить интегральную громкость.',
      analyzerVersion: 'ffmpeg-loudnorm/1.0',
    };

    return [
      silenceResult,
      loudnessResult,
      {
        checkType: 'background_noise',
        status: 'WARNING',
        measuredValue: { rmsDb, peakDb, noiseFloorDb, zeroCrossingsPerSample: this.parseAstats(output.stderr, 'Zero crossings rate') },
        expectedValue: null,
        details: 'Измерены акустические характеристики. SNR и помехи, мешающие речи, не оцениваются без достоверного VAD; наличие шума не трактуется как брак.',
        analyzerVersion: 'ffmpeg-astats-proxy/1.0',
      },
      {
        checkType: 'speech_vad',
        status: 'WARNING',
        measuredValue: null,
        expectedValue: null,
        details: 'VAD не поддерживается: речь не классифицируется по одному уровню сигнала или шумовой метрике.',
        analyzerVersion: 'unsupported/1.0',
      },
    ];
  }

  private loudnessStatus(metrics: Record<string, number | null>, input: AnalyzerInput): 'PASS' | 'FAIL' {
    const integrated = metrics.inputIntegratedLufs;
    const truePeak = metrics.inputTruePeakDbtp;
    const min = criterionNumber(input.criteria, 'audio_loudness', 'minIntegratedLufs') ?? -35;
    const max = criterionNumber(input.criteria, 'audio_loudness', 'maxIntegratedLufs') ?? -8;
    const maxPeak = criterionNumber(input.criteria, 'audio_loudness', 'maxTruePeakDbtp') ?? -1;
    return integrated !== null && integrated >= min && integrated <= max && truePeak !== null && truePeak <= maxPeak ? 'PASS' : 'FAIL';
  }

  private parseAstats(stderr: string, name: string): number | null {
    const overall = stderr.slice(stderr.lastIndexOf('Overall'));
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}:\\s*(-?inf|[-+]?\\d+(?:\\.\\d+)?)`, 'i');
    const match = overall.match(pattern) ?? stderr.match(pattern);
    if (!match) return null;
    if (match[1].toLowerCase().includes('inf')) return match[1].startsWith('-') ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseLoudness(stderr: string): Record<string, number | null> | null {
    const blocks = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
    if (!blocks?.length) return null;
    try {
      const data = JSON.parse(blocks[blocks.length - 1]) as Record<string, string>;
      return {
        inputIntegratedLufs: this.numberOrNull(data['input_i']),
        inputTruePeakDbtp: this.numberOrNull(data['input_tp']),
        inputLoudnessRangeLu: this.numberOrNull(data['input_lra']),
        inputThresholdLufs: this.numberOrNull(data['input_thresh']),
      };
    } catch {
      return null;
    }
  }

  private parseSilenceSegments(stderr: string, duration: number): SilenceSegment[] {
    const segments: SilenceSegment[] = [];
    let start: number | null = null;
    for (const line of stderr.split(/\r?\n/)) {
      const startMatch = line.match(/silence_start:\s*(-?[\d.]+)/);
      if (startMatch) start = Number(startMatch[1]);
      const endMatch = line.match(/silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
      if (endMatch && start !== null) {
        segments.push({ start, end: Number(endMatch[1]), duration: Number(endMatch[2]) });
        start = null;
      }
    }
    if (start !== null && duration >= start) segments.push({ start, end: duration, duration: duration - start });
    return segments;
  }

  private toNumber(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private numberOrNull(value: string | undefined): number | null {
    return value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
  }
}

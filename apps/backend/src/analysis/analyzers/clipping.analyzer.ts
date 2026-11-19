import { Injectable } from '@nestjs/common';
import { AnalyzerInput, CheckResultInput, VideoAnalyzer } from '../analysis.models';
import { CheckType, criterionNumber } from '../profile-criteria';
import { MediaToolsService } from '../media-tools.service';

@Injectable()
export class ClippingAnalyzer implements VideoAnalyzer {
  readonly checkTypes: readonly CheckType[] = ['audio_clipping'];

  constructor(private readonly tools: MediaToolsService) {}

  async analyze(input: AnalyzerInput): Promise<CheckResultInput[]> {
    if (!input.media) throw new Error('FFprobe не предоставил метаданные потоков.');
    const stream = input.media.streams.find((item) => item.codec_type === 'audio');
    if (!stream) {
      return [{
        checkType: 'audio_clipping', status: 'SKIPPED', measuredValue: null, expectedValue: null,
        details: 'Проверка clipping пропущена: аудиопоток отсутствует.', analyzerVersion: 'ffmpeg-pcm-clipping/1.0',
      }];
    }
    const measurement = await this.tools.measureClipping(input.filePath, stream.channels ?? 1);
    const maximumRatio = criterionNumber(input.criteria, 'audio_clipping', 'maxClippedSampleRatio') ?? 0.001;
    const detectedPlateau = measurement.longestFullScaleRunSamples >= 2;
    const status = measurement.fullScaleSampleRatio > maximumRatio
      ? 'FAIL'
      : detectedPlateau ? 'WARNING' : 'PASS';
    return [{
      checkType: 'audio_clipping',
      status,
      measuredValue: measurement,
      expectedValue: { maxFullScaleSampleRatio: maximumRatio, minimumConsecutiveSamplesForEvidence: 2 },
      details: status === 'FAIL'
        ? 'Доля full-scale PCM-сэмплов превышает настроенный порог.'
        : status === 'WARNING'
          ? 'Найдены повторяющиеся full-scale PCM-сэмплы; это признак возможного clipping.'
          : 'Повторяющиеся full-scale PCM-сэмплы не обнаружены. Кодек с потерями может скрыть исходный clipping.',
      analyzerVersion: 'ffmpeg-pcm-clipping/1.0',
      evidence: measurement.segments.map((segment) => ({
        timestamp: segment.start,
        problemType: 'full_scale_plateau',
        measuredValue: segment,
        details: `Full-scale участок длится ${segment.duration.toFixed(4)} с.`,
      })),
    }];
  }
}

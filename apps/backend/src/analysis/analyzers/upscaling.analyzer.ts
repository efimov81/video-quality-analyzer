import { Injectable } from '@nestjs/common';
import { AnalyzerInput, CheckResultInput, VideoAnalyzer } from '../analysis.models';
import { CheckType } from '../profile-criteria';

@Injectable()
export class UpscalingAnalyzer implements VideoAnalyzer {
  readonly checkTypes: readonly CheckType[] = ['upscaling_experimental'];

  async analyze(input: AnalyzerInput): Promise<CheckResultInput[]> {
    const video = input.media?.streams.find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
    if (!video) throw new Error('Видеопоток не найден.');
    return [{
      checkType: 'upscaling_experimental',
      status: 'WARNING',
      measuredValue: { width: video.width ?? null, height: video.height ?? null, codec: video.codec_name ?? null },
      expectedValue: null,
      details: 'Надёжный валидированный детектор upscaling не реализован. Разрешение и blur metric сами по себе не доказывают искусственное увеличение.',
      analyzerVersion: 'unsupported/1.0',
    }];
  }
}

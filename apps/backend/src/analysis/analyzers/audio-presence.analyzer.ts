import { Injectable } from '@nestjs/common';
import { AnalyzerInput, CheckResultInput, VideoAnalyzer } from '../analysis.models';
import { CheckType } from '../profile-criteria';

@Injectable()
export class AudioPresenceAnalyzer implements VideoAnalyzer {
  readonly checkTypes: readonly CheckType[] = ['audio_presence'];

  async analyze(input: AnalyzerInput): Promise<CheckResultInput[]> {
    if (!input.media) throw new Error('FFprobe не предоставил метаданные потоков.');
    const streams = input.media.streams.filter((stream) => stream.codec_type === 'audio');
    const required = input.criteria.audio_presence.required === true;
    const status = streams.length > 0 || !required ? 'PASS' : 'FAIL';
    const measuredValue = streams.map((stream) => ({
      index: stream.index,
      codec: stream.codec_name ?? null,
      sampleRateHz: stream.sample_rate ? Number(stream.sample_rate) : null,
      channels: stream.channels ?? null,
      durationSec: stream.duration ? Number(stream.duration) : null,
    }));
    return [{
      checkType: 'audio_presence',
      status,
      measuredValue: { audioStreamCount: streams.length, streams: measuredValue },
      expectedValue: { required },
      messageCode: streams.length ? 'analysis.audio_presence.found' : required ? 'analysis.audio_presence.requiredMissing' : 'analysis.audio_presence.optionalMissing',
      messageParams: { count: streams.length },
      details: streams.length ? `Найдено аудиопотоков: ${streams.length}.` : required ? 'Обязательный аудиопоток отсутствует.' : 'Аудиопоток отсутствует, но он не обязателен в профиле.',
      analyzerVersion: 'ffprobe-audio-stream/1.0',
    }];
  }
}

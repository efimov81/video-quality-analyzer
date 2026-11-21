import { Injectable } from '@nestjs/common';
import { AnalyzerInput, CheckResultInput, VideoAnalyzer } from '../analysis.models';
import { CheckType, criterionNumber } from '../profile-criteria';
import { MediaToolsService } from '../media-tools.service';

@Injectable()
export class SceneCutsAnalyzer implements VideoAnalyzer {
  readonly checkTypes: readonly CheckType[] = ['scene_cuts'];

  constructor(private readonly tools: MediaToolsService) {}

  async analyze(input: AnalyzerInput): Promise<CheckResultInput[]> {
    const video = input.media?.streams.find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
    if (!video) throw new Error('Видеопоток не найден.');
    const threshold = criterionNumber(input.criteria, 'scene_cuts', 'sensitivity') ?? 15;
    const output = await this.tools.ffmpeg(input.filePath, [
      '-map', '0:v:0', '-vf', `scdet=threshold=${threshold},metadata=print`, '-an', '-f', 'null', '-',
    ]);
    const candidates = this.parseCuts(output.stderr, threshold);
    const dedupWindow = criterionNumber(input.criteria, 'scene_cuts', 'dedupWindowSec') ?? 1;
    const cuts = this.coalesce(candidates, dedupWindow);
    const intervals = cuts.slice(1).map((cut, index) => ({ from: cuts[index].timestamp, to: cut.timestamp, seconds: cut.timestamp - cuts[index].timestamp }));
    const minInterval = criterionNumber(input.criteria, 'scene_cuts', 'minIntervalSec') ?? 5;
    const maxFrequentCuts = criterionNumber(input.criteria, 'scene_cuts', 'maxFrequentCuts') ?? 0;
    const frequent = intervals.filter((interval) => interval.seconds < minInterval);
    const status = frequent.length > maxFrequentCuts ? 'FAIL' : 'PASS';
    const evidence = frequent.map((interval) => ({
      timestamp: interval.to,
      problemType: 'frequent_scene_cut',
      measuredValue: interval,
      messageCode: 'analysis.evidence.frequent_scene_cut',
      messageParams: { duration: interval.seconds, limit: minInterval },
      details: `Между сменами сцен ${interval.seconds.toFixed(2)} с; профиль требует не менее ${minInterval} с.`,
    }));
    return [{
      checkType: 'scene_cuts',
      status,
      measuredValue: { cutCount: cuts.length, candidateCount: candidates.length, timestamps: cuts.map((cut) => cut.timestamp), intervals, frequentCutCount: frequent.length, shortestIntervals: [...intervals].sort((a, b) => a.seconds - b.seconds).slice(0, 10), threshold, dedupWindowSec: dedupWindow },
      expectedValue: { minIntervalSec: minInterval, maxFrequentCuts, threshold, dedupWindowSec: dedupWindow },
      messageCode: frequent.length ? 'analysis.scene_cuts.shortIntervals' : 'analysis.scene_cuts.detected',
      messageParams: { count: frequent.length || cuts.length },
      details: frequent.length ? `Обнаружено частых интервалов между склейками: ${frequent.length}. Scene detector не гарантирует обнаружение всех монтажных склеек.` : `Обнаружено смен сцен: ${cuts.length}. Scene detector не гарантирует обнаружение всех монтажных склеек.`,
      analyzerVersion: 'ffmpeg-scdet/1.0',
      evidence,
    }];
  }

  private parseCuts(stderr: string, threshold: number): Array<{ timestamp: number; score: number }> {
    const frames = stderr.split(/(?=frame:\s*\d+)/);
    const cuts: Array<{ timestamp: number; score: number }> = [];
    for (const frame of frames) {
      const score = this.metric(frame, 'lavfi.scd.score');
      const time = this.metric(frame, 'lavfi.scd.time') ?? this.metric(frame, 'pts_time');
      if (score !== null && score >= threshold && time !== null && time >= 1) cuts.push({ timestamp: time, score });
    }
    return cuts;
  }

  private coalesce(candidates: Array<{ timestamp: number; score: number }>, windowSec: number): Array<{ timestamp: number; score: number }> {
    const cuts: Array<{ timestamp: number; score: number }> = [];
    for (const candidate of candidates) {
      const previous = cuts[cuts.length - 1];
      if (previous && candidate.timestamp - previous.timestamp < windowSec) {
        if (candidate.score > previous.score) cuts[cuts.length - 1] = candidate;
        continue;
      }
      cuts.push(candidate);
    }
    return cuts;
  }

  private metric(text: string, key: string): number | null {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}(?:=|:)\\s*([\\d.]+)`));
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
}

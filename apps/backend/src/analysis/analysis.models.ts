import { CheckType, ProfileCriteria } from './profile-criteria';

export type CheckResultStatus = 'PASS' | 'FAIL' | 'WARNING' | 'ERROR' | 'SKIPPED';

export interface MediaStreamInfo {
  index: number;
  codec_type: 'video' | 'audio' | string;
  codec_name?: string;
  width?: number;
  height?: number;
  bit_rate?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  start_time?: string;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
}

export interface MediaInfo {
  streams: MediaStreamInfo[];
  format: { duration?: string; bit_rate?: string; format_name?: string };
}

export interface AnalysisEvidenceInput {
  timestamp: number;
  problemType: string;
  measuredValue: unknown;
  details: string;
}

export interface CheckResultInput {
  checkType: CheckType;
  status: CheckResultStatus;
  measuredValue: unknown;
  expectedValue: unknown;
  details: string;
  analyzerVersion: string;
  evidence?: AnalysisEvidenceInput[];
}

export interface AnalyzerInput {
  runId: string;
  videoId: string;
  filePath: string;
  media: MediaInfo | null;
  criteria: ProfileCriteria;
}

export interface VideoAnalyzer {
  readonly checkTypes: readonly CheckType[];
  analyze(input: AnalyzerInput): Promise<CheckResultInput[]>;
}

export interface ProfileSnapshot {
  id: string;
  name: string;
  version: number;
  criteria: ProfileCriteria;
}

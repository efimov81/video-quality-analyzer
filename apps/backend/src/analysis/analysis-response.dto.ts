import { ApiProperty } from '@nestjs/swagger';
import { AnalysisCheckResult, AnalysisRun, analysisRunStatus, checkStatus } from '../database/schema';
import { JobResponseDto } from '../jobs/job-response.dto';
import { messageParamValues, type MessageParams } from '../common/api-message';

class ProfileSnapshotDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: 'integer' }) version!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'object', additionalProperties: true },
    description: 'Настройки проверок в снимке профиля. Набор параметров зависит от проверки.',
  })
  criteria!: Record<string, Record<string, unknown>>;
}

export class AnalysisRunResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', description: 'ID скачанного видео (job ID).' }) videoId!: string;
  @ApiProperty({ format: 'uuid' }) profileId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) requestedByUserId!: string | null;
  @ApiProperty() profileVersion!: number;
  @ApiProperty({ type: ProfileSnapshotDto }) profileSnapshot!: ProfileSnapshotDto;
  @ApiProperty({ enum: analysisRunStatus.enumValues }) status!: AnalysisRun['status'];
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) startedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
}

export class CreateAnalysisRunResponseDto extends AnalysisRunResponseDto {
  @ApiProperty({ description: 'Возвращён ранее созданный активный запуск.' }) reused!: boolean;
}

export class AnalysisSummaryDto {
  @ApiProperty({ type: AnalysisRunResponseDto }) run!: AnalysisRunResponseDto;
  @ApiProperty({ type: String, nullable: true }) videoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) videoPath!: string | null;
}

// The JSONB values are analyzer-specific and can include nested JSON and scalar values.
const metricValueSchema = {
  anyOf: [
    { type: 'object', additionalProperties: true },
    { type: 'array', items: {} },
    { type: 'number' },
    { type: 'boolean' },
    { type: 'string', nullable: true },
  ],
} satisfies Parameters<typeof ApiProperty>[0];

class AnalysisMessageDto {
  @ApiProperty({ type: String, nullable: true })
  messageCode!: string | null;

  @ApiProperty({
    anyOf: [
      { type: 'object', additionalProperties: messageParamValues },
      { type: 'string', nullable: true, enum: [null] },
    ],
  })
  messageParams!: MessageParams | null;
}

class AnalysisEvidenceDto extends AnalysisMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) analysisCheckResultId!: string;
  @ApiProperty({ description: 'Таймкод в секундах.' }) timestamp!: number;
  @ApiProperty() problemType!: string;
  @ApiProperty(metricValueSchema) measuredValue!: unknown;
  @ApiProperty() details!: string;
}

class AnalysisCheckResultDto extends AnalysisMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) analysisRunId!: string;
  @ApiProperty() checkType!: string;
  @ApiProperty({ enum: checkStatus.enumValues }) status!: AnalysisCheckResult['status'];
  @ApiProperty(metricValueSchema) measuredValue!: unknown;
  @ApiProperty(metricValueSchema) expectedValue!: unknown;
  @ApiProperty() details!: string;
  @ApiProperty() analyzerVersion!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [AnalysisEvidenceDto] }) evidence!: AnalysisEvidenceDto[];
}

export class AnalysisReportDto {
  @ApiProperty({ type: AnalysisRunResponseDto }) run!: AnalysisRunResponseDto;
  @ApiProperty({ type: JobResponseDto }) video!: JobResponseDto;
  @ApiProperty({ type: ProfileSnapshotDto }) profile!: ProfileSnapshotDto;
  @ApiProperty({ enum: ['ACCEPT', 'REJECT', 'MANUAL_REVIEW'] }) conclusion!: string;
  @ApiProperty({ type: [AnalysisCheckResultDto] }) checks!: AnalysisCheckResultDto[];
}

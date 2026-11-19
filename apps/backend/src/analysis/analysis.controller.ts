import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { AnalysisService } from './analysis.service';

class CreateAnalysisRunDto {
  @ApiProperty({ format: 'uuid', description: 'ID скачанного видео (job ID).' })
  @IsUUID('4')
  videoId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  profileId!: string;
}

class AnalysisRunResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', description: 'ID скачанного видео (job ID).' }) videoId!: string;
  @ApiProperty({ format: 'uuid' }) profileId!: string;
  @ApiProperty() profileVersion!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) profileSnapshot!: Record<string, unknown>;
  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) startedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
}

class AnalysisSummaryDto {
  @ApiProperty({ type: AnalysisRunResponseDto }) run!: AnalysisRunResponseDto;
  @ApiProperty({ type: String, nullable: true }) videoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) videoPath!: string | null;
}

class AnalysisReportDto {
  @ApiProperty({ type: AnalysisRunResponseDto }) run!: AnalysisRunResponseDto;
  @ApiProperty({ type: 'object', additionalProperties: true }) video!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true }) profile!: Record<string, unknown>;
  @ApiProperty({ enum: ['ACCEPT', 'REJECT', 'MANUAL_REVIEW'] }) conclusion!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) checks!: Record<string, unknown>[];
}

@ApiTags('analysis')
@Controller('api/analysis-runs')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Анализ создан и поставлен в фоновую очередь.', type: AnalysisRunResponseDto })
  create(@Body() body: CreateAnalysisRunDto) {
    return this.analysis.create(body.videoId, body.profileId);
  }

  @Get()
  @ApiOkResponse({ description: 'Список запусков анализа.', type: AnalysisSummaryDto, isArray: true })
  list() {
    return this.analysis.list();
  }

  @Get(':id/report')
  @ApiOkResponse({ description: 'Полный отчёт с результатами и таймкодами.', type: AnalysisReportDto })
  report(@Param('id') id: string) {
    return this.analysis.report(id);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Состояние запуска анализа.', type: AnalysisRunResponseDto })
  get(@Param('id') id: string) {
    return this.analysis.get(id);
  }
}

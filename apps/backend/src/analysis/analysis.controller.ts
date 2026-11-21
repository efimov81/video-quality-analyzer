import { ApiMessageErrorDto } from '../common/api-message';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiServiceUnavailableResponse, ApiAcceptedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { ExternalActorDto } from '../users/external-actor.dto';
import { AnalysisReportDto, AnalysisRunResponseDto, AnalysisSummaryDto } from './analysis-response.dto';
import { AnalysisService } from './analysis.service';

class CreateAnalysisRunDto extends ExternalActorDto {
  @ApiProperty({ format: 'uuid', description: 'ID скачанного видео (job ID).' })
  @IsUUID('4')
  videoId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  profileId!: string;
}

@ApiTags('analysis')
@Controller('api/analysis-runs')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post()
  @ApiBadRequestResponse({ type: ApiMessageErrorDto })
  @ApiForbiddenResponse({ type: ApiMessageErrorDto })
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiServiceUnavailableResponse({ type: ApiMessageErrorDto })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Анализ создан и поставлен в фоновую очередь.', type: AnalysisRunResponseDto })
  create(@Body() body: CreateAnalysisRunDto) {
    return this.analysis.create(body.videoId, body.profileId, body);
  }

  @Get()
  @ApiOkResponse({ description: 'Список запусков анализа.', type: AnalysisSummaryDto, isArray: true })
  list() {
    return this.analysis.list();
  }

  @Get(':id/report')
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiOkResponse({ description: 'Полный отчёт с результатами и таймкодами.', type: AnalysisReportDto })
  report(@Param('id') id: string) {
    return this.analysis.report(id);
  }

  @Get(':id')
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiOkResponse({ description: 'Состояние запуска анализа.', type: AnalysisRunResponseDto })
  get(@Param('id') id: string) {
    return this.analysis.get(id);
  }
}

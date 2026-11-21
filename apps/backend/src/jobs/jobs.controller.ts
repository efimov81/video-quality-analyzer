import { ApiMessageErrorDto, localizedException } from '../common/api-message';
import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Job } from '../database/schema';
import type { SessionUser } from '../auth/auth.models';
import { CurrentUser } from '../auth/session.guard';
import { JobDetailsDto, JobResponseDto, VideoAlreadyExistsDto } from './job-response.dto';
import { profileCodePattern } from '../analysis/profiles.service';
import { JobsService } from './jobs.service';

class CreateJobDto {
  @ApiProperty({ example: 'https://example.com/video' })
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;

  @ApiProperty({ required: false, default: false })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsBoolean()
  autoAnalyze?: boolean;

  @ApiProperty({ required: false, pattern: profileCodePattern.source })
  @ValidateIf((_dto, value) => value !== undefined)
  @Matches(profileCodePattern)
  profileCode?: string;
}

@ApiTags('jobs')
@ApiCookieAuth()
@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiBadRequestResponse({ type: ApiMessageErrorDto })
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiConflictResponse({ type: VideoAlreadyExistsDto })
  @ApiCreatedResponse({ description: 'Задание создано и помещено в очередь.', type: JobResponseDto })
  create(@Body() dto: CreateJobDto, @CurrentUser() user: SessionUser): Promise<Job> {
    if (typeof dto?.sourceUrl !== 'string' || dto.sourceUrl.length > 2048) {
      throw localizedException(BadRequestException, 'Ссылка обязательна и должна быть не длиннее 2048 символов.', 'errors.urlLength', { limit: 2048 });
    }
    try {
      const url = new URL(dto.sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      throw localizedException(BadRequestException, 'Укажите корректную ссылку HTTP или HTTPS.', 'errors.invalidUrl');
    }
    return this.jobs.create(dto.sourceUrl, user, dto);
  }

  @Get()
  @ApiOkResponse({ description: 'Список заданий на загрузку.', type: JobDetailsDto, isArray: true })
  list(@CurrentUser() user: SessionUser) {
    return this.jobs.list(user);
  }

  @Get(':id')
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: JobDetailsDto })
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    const job = await this.jobs.get(id, user);
    if (!job) throw localizedException(NotFoundException, 'Задание не найдено.', 'errors.jobNotFound');
    return job;
  }
}

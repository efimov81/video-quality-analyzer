import { ApiMessageErrorDto, localizedException } from '../common/api-message';
import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { Job } from '../database/schema';
import { JobResponseDto } from './job-response.dto';
import { JobsService } from './jobs.service';

class CreateJobDto {
  @ApiProperty({ example: 'https://example.com/video' })
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;
}

@ApiTags('jobs')
@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiBadRequestResponse({ type: ApiMessageErrorDto })
  @ApiCreatedResponse({ description: 'Задание создано и помещено в очередь.', type: JobResponseDto })
  create(@Body() dto: CreateJobDto): Promise<Job> {
    if (typeof dto?.sourceUrl !== 'string' || dto.sourceUrl.length > 2048) {
      throw localizedException(BadRequestException, 'Ссылка обязательна и должна быть не длиннее 2048 символов.', 'errors.urlLength', { limit: 2048 });
    }
    try {
      const url = new URL(dto.sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      throw localizedException(BadRequestException, 'Укажите корректную ссылку HTTP или HTTPS.', 'errors.invalidUrl');
    }
    return this.jobs.create(dto.sourceUrl);
  }

  @Get()
  @ApiOkResponse({ description: 'Список заданий на загрузку.', type: JobResponseDto, isArray: true })
  list(): Promise<Job[]> {
    return this.jobs.list();
  }

  @Get(':id')
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: JobResponseDto })
  async get(@Param('id') id: string): Promise<Job> {
    const job = await this.jobs.get(id);
    if (!job) throw localizedException(NotFoundException, 'Задание не найдено.', 'errors.jobNotFound');
    return job;
  }
}

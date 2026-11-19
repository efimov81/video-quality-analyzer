import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { Job } from '../database/schema';
import { JobsService } from './jobs.service';

class CreateJobDto {
  @ApiProperty({ example: 'https://example.com/video' })
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;
}

class JobResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sourceUrl!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) localPath!: string | null;
  @ApiProperty({ enum: ['QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'FAILED'] }) status!: Job['status'];
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) startedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
}

@ApiTags('jobs')
@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Задание создано и помещено в очередь.', type: JobResponseDto })
  create(@Body() dto: CreateJobDto): Promise<Job> {
    if (typeof dto?.sourceUrl !== 'string' || dto.sourceUrl.length > 2048) {
      throw new BadRequestException('Ссылка обязательна и должна быть не длиннее 2048 символов.');
    }
    try {
      const url = new URL(dto.sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      throw new BadRequestException('Укажите корректную ссылку HTTP или HTTPS.');
    }
    return this.jobs.create(dto.sourceUrl);
  }

  @Get()
  @ApiOkResponse({ description: 'Список заданий на загрузку.', type: JobResponseDto, isArray: true })
  list(): Promise<Job[]> {
    return this.jobs.list();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: JobResponseDto })
  async get(@Param('id') id: string): Promise<Job> {
    const job = await this.jobs.get(id);
    if (!job) throw new NotFoundException('Задание не найдено.');
    return job;
  }
}

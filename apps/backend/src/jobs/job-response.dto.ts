import { ApiProperty } from '@nestjs/swagger';
import { Job, jobStatus } from '../database/schema';
import { messageParamValues, type MessageParams } from '../common/api-message';
import { preflightStatuses, type PreflightCheck, type PreflightStatus } from '../downloader/video-preflight';
import { jobSources, type JobSource } from './job-source';

export class VideoAlreadyExistsDto {
  @ApiProperty({ enum: [409] }) statusCode!: 409;
  @ApiProperty({ enum: ['Conflict'] }) error!: 'Conflict';
  @ApiProperty({ enum: ['VIDEO_ALREADY_EXISTS'] }) code!: 'VIDEO_ALREADY_EXISTS';
  @ApiProperty({ example: 'Видео уже добавлено' }) message!: string;
  @ApiProperty({ format: 'uuid' }) jobId!: string;
}

class PreflightCheckDto implements PreflightCheck {
  @ApiProperty({ enum: ['availability', 'duration', 'shorts', 'resolution'] })
  check!: PreflightCheck['check'];
  @ApiProperty({ enum: [...preflightStatuses, 'SKIPPED'] }) status!: PreflightCheck['status'];
  @ApiProperty() reason!: string;
  @ApiProperty({ type: 'object', additionalProperties: messageParamValues }) params!: MessageParams;
}

class PreflightResultDto {
  @ApiProperty({ enum: preflightStatuses }) status!: PreflightStatus;
  @ApiProperty({ type: [PreflightCheckDto] }) checks!: PreflightCheckDto[];
}

export class JobResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sourceUrl!: string;
  @ApiProperty({ enum: jobSources }) source!: JobSource;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) createdByUserId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) preflightProfileVersionId!: string | null;
  @ApiProperty({ type: PreflightResultDto, nullable: true }) preflight!: PreflightResultDto | null;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) localPath!: string | null;
  @ApiProperty({ enum: jobStatus.enumValues }) status!: Job['status'];
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) startedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
}

export class JobCreatorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
  @ApiProperty() displayName!: string;
}

export class JobDetailsDto extends JobResponseDto {
  @ApiProperty({ type: JobCreatorDto, nullable: true }) createdBy!: JobCreatorDto | null;
}

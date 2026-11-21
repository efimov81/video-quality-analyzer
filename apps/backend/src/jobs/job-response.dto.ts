import { ApiProperty } from '@nestjs/swagger';
import { Job, jobStatus } from '../database/schema';
import { jobSources, type JobSource } from './job-source';

export class JobResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sourceUrl!: string;
  @ApiProperty({ enum: jobSources }) source!: JobSource;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) createdByUserId!: string | null;
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

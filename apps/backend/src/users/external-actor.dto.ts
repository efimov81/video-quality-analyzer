import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { defaultJobSource, jobSources, type JobSource } from '../jobs/job-source';

export class ExternalActorDto {
  @ApiPropertyOptional({ enum: jobSources, default: defaultJobSource })
  @ValidateIf((_dto, source) => source !== undefined)
  @IsIn(jobSources)
  source?: JobSource;

  @ApiPropertyOptional({ minLength: 1, maxLength: 255 })
  @ValidateIf((_dto, id) => id !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalUserId?: string;
}

import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { JobsModule } from './jobs/jobs.module';
import { AnalysisModule } from './analysis/analysis.module';

@Module({ imports: [DatabaseModule, JobsModule, AnalysisModule] })
export class AppModule {}

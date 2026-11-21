import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { JobsModule } from './jobs/jobs.module';
import { AnalysisModule } from './analysis/analysis.module';

@Module({ imports: [DatabaseModule, AuthModule, JobsModule, AnalysisModule] })
export class AppModule {}

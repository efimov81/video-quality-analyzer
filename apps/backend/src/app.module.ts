import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { JobsModule } from './jobs/jobs.module';
import { AnalysisModule } from './analysis/analysis.module';

import { TelegramModule } from './telegram/telegram.module';

@Module({ imports: [DatabaseModule, AuthModule, JobsModule, AnalysisModule, TelegramModule] })
export class AppModule {}

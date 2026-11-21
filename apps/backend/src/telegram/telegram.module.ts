import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { JobsModule } from '../jobs/jobs.module';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramCommandsService } from './telegram-commands.service';
import { TelegramNotificationsService } from './telegram-notifications.service';

@Module({
  imports: [AnalysisModule, JobsModule],
  providers: [TelegramBotService, TelegramCommandsService, TelegramNotificationsService],
})
export class TelegramModule {}

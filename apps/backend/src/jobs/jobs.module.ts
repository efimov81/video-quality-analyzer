import { AnalysisModule } from '../analysis/analysis.module';
import { Module } from '@nestjs/common';
import { VideoDownloaderService } from '../downloader/video-downloader.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({ imports: [AnalysisModule], exports: [JobsService], controllers: [JobsController], providers: [JobsService, VideoDownloaderService] })
export class JobsModule {}

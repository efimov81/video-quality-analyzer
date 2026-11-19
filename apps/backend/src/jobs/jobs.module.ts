import { Module } from '@nestjs/common';
import { VideoDownloaderService } from '../downloader/video-downloader.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({ controllers: [JobsController], providers: [JobsService, VideoDownloaderService] })
export class JobsModule {}

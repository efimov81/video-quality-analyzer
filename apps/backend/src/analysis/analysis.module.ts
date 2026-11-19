import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { VIDEO_ANALYZERS } from './analysis.constants';
import { AnalysisQueueService } from './analysis-queue.service';
import { AnalysisService } from './analysis.service';
import { AnalysisWorkerService } from './analysis-worker.service';
import { AudioPresenceAnalyzer } from './analyzers/audio-presence.analyzer';
import { AudioSignalAnalyzer } from './analyzers/audio-signal.analyzer';
import { ClippingAnalyzer } from './analyzers/clipping.analyzer';
import { MetadataAnalyzer } from './analyzers/metadata.analyzer';
import { SceneCutsAnalyzer } from './analyzers/scene-cuts.analyzer';
import { VisualAnalyzer } from './analyzers/visual.analyzer';
import { UpscalingAnalyzer } from './analyzers/upscaling.analyzer';
import { MediaToolsService } from './media-tools.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  controllers: [AnalysisController, ProfilesController],
  providers: [
    ProfilesService,
    AnalysisService,
    AnalysisQueueService,
    AnalysisWorkerService,
    MediaToolsService,
    MetadataAnalyzer,
    AudioPresenceAnalyzer,
    AudioSignalAnalyzer,
    ClippingAnalyzer,
    SceneCutsAnalyzer,
    VisualAnalyzer,
    UpscalingAnalyzer,
    {
      provide: VIDEO_ANALYZERS,
      useFactory: (
        metadata: MetadataAnalyzer,
        audioPresence: AudioPresenceAnalyzer,
        audioSignal: AudioSignalAnalyzer,
        clipping: ClippingAnalyzer,
        sceneCuts: SceneCutsAnalyzer,
        visual: VisualAnalyzer,
        upscaling: UpscalingAnalyzer,
      ) => [metadata, audioPresence, audioSignal, clipping, sceneCuts, visual, upscaling],
      inject: [MetadataAnalyzer, AudioPresenceAnalyzer, AudioSignalAnalyzer, ClippingAnalyzer, SceneCutsAnalyzer, VisualAnalyzer, UpscalingAnalyzer],
    },
  ],
})
export class AnalysisModule {}

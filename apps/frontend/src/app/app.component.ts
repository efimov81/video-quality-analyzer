import { requestError, RequestError } from './core/i18n/request-error';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from './core/i18n/language.service';
import { MessageParamsPipe } from './core/i18n/message-params.pipe';
import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { JobsApiService } from './core/services/jobs-api.service';
import { AnalysisApiService } from './core/services/analysis-api.service';
import { AnalysisSummaryDto } from './api/generated/models/analysis-summary-dto';
import { VideoCardComponent } from './components/video-card/video-card.component';

import { JobResponseDto } from './api/generated/models/job-response-dto';

@Component({
  selector: 'vqa-root',
  standalone: true,
  imports: [TranslocoPipe, MessageParamsPipe, ReactiveFormsModule, VideoCardComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly language = inject(LanguageService);

  readonly jobs = signal<JobResponseDto[]>([]);
  readonly submitting = signal(false);
  readonly loadError = signal('');
  readonly submitError = signal<RequestError | null>(null);
  readonly form = new FormGroup({
    sourceUrl: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^https?:\/\/.+/i)] }),
  });
  private refreshTimer?: ReturnType<typeof setInterval>;

  private readonly analysisApi = inject(AnalysisApiService);
  readonly analysisRuns = signal<AnalysisSummaryDto[]>([]);

  constructor(private readonly jobsApi: JobsApiService) { }

  ngOnInit(): void {
    void this.refresh();
    this.refreshAnalysisRuns();
    this.refreshTimer = setInterval(() => void this.refresh(), 5000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.jobsApi.create(this.form.controls.sourceUrl.value.trim()).subscribe({
      next: (job) => {
        this.jobs.update((jobs) => [job, ...jobs]);
        this.form.reset({ sourceUrl: '' });
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.submitError.set(requestError(error, 'errors.createJob'));
        this.submitting.set(false);
      },
    });
  }

  runsForVideo(videoId: string): AnalysisSummaryDto[] {
    return this.analysisRuns().filter(
      item => item.run.videoId === videoId
    );
  }

  private refresh(): Promise<void> {
    return new Promise((resolve) => this.jobsApi.list().subscribe({
      next: (jobs) => { this.jobs.set(jobs); this.loadError.set(''); resolve(); },
      error: () => { this.loadError.set('errors.loadJobs'); resolve(); },
    }));
  }

  private refreshAnalysisRuns(): void {
    this.analysisApi.list().subscribe({
      next: runs => this.analysisRuns.set(runs),
      error: () => console.error('Failed to load analysis runs'),
    });
  }
}

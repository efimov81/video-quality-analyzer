import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { JobsApiService } from './core/services/jobs-api.service';
import { Job } from './api/generated/models/job';

@Component({
  selector: 'vqa-root',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly jobs = signal<Job[]>([]);
  readonly submitting = signal(false);
  readonly loadError = signal('');
  readonly submitError = signal('');
  readonly form = new FormGroup({
    sourceUrl: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^https?:\/\/.+/i)] }),
  });
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly jobsApi: JobsApiService) {}

  ngOnInit(): void {
    void this.refresh();
    this.refreshTimer = setInterval(() => void this.refresh(), 5000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set('');
    this.jobsApi.create(this.form.controls.sourceUrl.value.trim()).subscribe({
      next: (job) => {
        this.jobs.update((jobs) => [job, ...jobs]);
        this.form.reset({ sourceUrl: '' });
        this.submitting.set(false);
      },
      error: (error: { error?: { message?: string } }) => {
        this.submitError.set(error.error?.message ?? 'Failed to create job. Please check your connection to the server.');
        this.submitting.set(false);
      },
    });
  }

  statusLabel(status: Job['status']): string {
    return ({ QUEUED: 'In Queue', DOWNLOADING: 'Downloading', DOWNLOADED: 'Downloaded', FAILED: 'Failed' })[status];
  }

  private refresh(): Promise<void> {
    return new Promise((resolve) => this.jobsApi.list().subscribe({
      next: (jobs) => { this.jobs.set(jobs); this.loadError.set(''); resolve(); },
      error: () => { this.loadError.set('Failed to load job list.'); resolve(); },
    }));
  }
}

import { requestError, RequestError } from '../../core/i18n/request-error';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, concatMap, finalize, from, map, of, reduce } from 'rxjs';
import { ProfilesService } from '../../api/generated/services/profiles.service';
import type { ProfileResponseDto } from '../../api/generated/models/profile-response-dto';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { MessageParamsPipe } from '../../core/i18n/message-params.pipe';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { JobsApiService } from '../../core/services/jobs-api.service';
import { AnalysisApiService } from '../../core/services/analysis-api.service';
import { AnalysisSummaryDto } from '../../api/generated/models/analysis-summary-dto';
import { VideoCardComponent } from '../../components/video-card/video-card.component';

import type { JobCreatorDto } from '../../api/generated/models/job-creator-dto';
import type { JobDetailsDto } from '../../api/generated/models/job-details-dto';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'vqa-videos',
  standalone: true,
  imports: [TranslocoPipe, MessageParamsPipe, ReactiveFormsModule, VideoCardComponent],
  templateUrl: './videos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideosComponent implements OnInit, OnDestroy {
  readonly language = inject(LanguageService);

  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);
  readonly isAdmin = computed(() => this.session.user()?.role === 'admin');
  readonly jobs = signal<JobDetailsDto[]>([]);
  readonly ownerFilter = new FormControl('', { nonNullable: true });
  private readonly selectedOwner = toSignal(this.ownerFilter.valueChanges, { initialValue: '' });
  readonly owners = computed(() => {
    const owners = new Map<string, JobCreatorDto>();
    for (const { createdBy } of this.jobs()) {
      if (createdBy) owners.set(createdBy.id, createdBy);
    }
    return [...owners.values()].sort((a, b) => this.ownerName(a).localeCompare(this.ownerName(b), this.language.language()));
  });
  readonly visibleJobs = computed(() => {
    const owner = this.selectedOwner();
    const jobs = this.jobs();
    if (!this.isAdmin() || !owner) return jobs;
    return jobs.filter((job) => (job.createdBy?.id ?? 'unassigned') === owner);
  });
  private readonly profilesApi = inject(ProfilesService);
  readonly activeProfiles = signal<ProfileResponseDto[]>([]);
  readonly profilesError = signal('');
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly downloadableJobs = computed(() => this.visibleJobs().filter((job) => job.status === 'DOWNLOADED'));
  readonly selectedJobs = computed(() => this.downloadableJobs().filter((job) => this.selectedIds().has(job.id)));
  readonly allSelected = computed(() => this.selectedJobs().length > 0 && this.selectedJobs().length === this.downloadableJobs().length);
  readonly batchProfile = new FormControl('', { nonNullable: true });
  readonly batchBusy = signal(false);
  readonly batchResult = signal<{ queued: number; skipped: number; failed: number } | null>(null);
  readonly submitting = signal(false);
  readonly loadError = signal('');
  readonly submitError = signal<RequestError | null>(null);
  readonly form = new FormGroup({
    autoAnalyze: new FormControl(false, { nonNullable: true }),
    profileCode: new FormControl('', { nonNullable: true }),
    sourceUrl: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^https?:\/\/.+/i)] }),
  });
  private refreshTimer?: ReturnType<typeof setInterval>;

  private readonly analysisApi = inject(AnalysisApiService);
  readonly analysisRuns = signal<AnalysisSummaryDto[]>([]);

  constructor(private readonly jobsApi: JobsApiService) { }

  ngOnInit(): void {
    this.refresh();
    this.refreshAnalysisRuns();
    this.loadProfiles();
    this.refreshTimer = setInterval(() => {
      this.refresh();
      this.refreshAnalysisRuns();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  submit(): void {
    const { sourceUrl, autoAnalyze, profileCode } = this.form.getRawValue();
    if (this.form.invalid || this.submitting() || (autoAnalyze && !profileCode)) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.jobsApi.create({ sourceUrl: sourceUrl.trim(), autoAnalyze, profileCode: autoAnalyze ? profileCode : undefined }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.refresh();
        this.form.controls.sourceUrl.reset();
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.submitError.set(requestError(error, 'errors.createJob'));
        this.submitting.set(false);
      },
    });
  }

  toggleJob(id: string, checked: boolean): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleAll(checked: boolean): void {
    const candidates = this.downloadableJobs();
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      for (const { id } of candidates) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  startBatch(): void {
    const jobs = this.selectedJobs();
    const profileId = this.batchProfile.value;
    if (!jobs.length || !profileId || this.batchBusy()) return;

    this.batchBusy.set(true);
    this.batchResult.set(null);
    from(jobs).pipe(
      concatMap((job) => this.analysisApi.create(job.id, profileId).pipe(
        map((run) => run.reused ? 'skipped' as const : 'queued' as const),
        catchError((error: unknown) => of(
          error instanceof HttpErrorResponse && error.status === 409 ? 'skipped' as const : 'failed' as const,
        )),
      )),
      reduce((total, outcome) => ({ ...total, [outcome]: total[outcome] + 1 }), { queued: 0, skipped: 0, failed: 0 }),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.batchBusy.set(false)),
    ).subscribe((result) => {
      this.batchResult.set(result);
      this.refreshAnalysisRuns();
    });
  }

  private loadProfiles(): void {
    this.profilesApi.profilesControllerList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (profiles) => {
        const active = profiles.filter((profile) => profile.isActive);
        const defaultProfile = active.find((profile) => profile.isDefault);
        this.activeProfiles.set(active);
        this.form.controls.profileCode.setValue(defaultProfile?.code ?? '');
        this.batchProfile.setValue(defaultProfile?.id ?? '');
      },
      error: (error: unknown) => this.profilesError.set(requestError(error, 'errors.loadProfiles').code),
    });
  }

  runsForVideo(videoId: string): AnalysisSummaryDto[] {
    return this.analysisRuns().filter(
      item => item.run.videoId === videoId
    );
  }

  ownerName(owner: JobCreatorDto): string {
    return owner.displayName.trim() || owner.username || owner.id;
  }

  private refresh(): void {
    this.jobsApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (jobs) => { this.jobs.set(jobs); this.loadError.set(''); },
      error: (error: unknown) => this.loadError.set(requestError(error, 'errors.loadJobs').code),
    });
  }

  private refreshAnalysisRuns(): void {
    this.analysisApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: runs => this.analysisRuns.set(runs),
      error: () => console.error('Failed to load analysis runs'),
    });
  }
}

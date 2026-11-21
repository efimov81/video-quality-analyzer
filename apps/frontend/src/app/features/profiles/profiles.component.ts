import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ProfileResponseDto } from '../../api/generated/models/profile-response-dto';
import { ProfilesService } from '../../api/generated/services/profiles.service';
import { LanguageService } from '../../core/i18n/language.service';
import { MessageParamsPipe } from '../../core/i18n/message-params.pipe';
import { requestError, type RequestError } from '../../core/i18n/request-error';

@Component({
  imports: [ReactiveFormsModule, TranslocoPipe, MessageParamsPipe],
  templateUrl: './profiles.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilesComponent implements OnInit {
  readonly language = inject(LanguageService);
  readonly profiles = signal<ProfileResponseDto[]>([]);
  readonly editing = signal(false);
  readonly selected = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<RequestError | null>(null);
  readonly saved = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/.*\S.*/s), Validators.maxLength(120)]],
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9_-]{0,63}$/)]],
    description: ['', Validators.maxLength(2000)],
    isActive: [true],
    isDefault: [false],
    criteriaText: ['{}', Validators.required],
  });
  private readonly api = inject(ProfilesService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.load();
  }

  edit(profile?: ProfileResponseDto): void {
    this.selected.set(profile?.id ?? null);
    this.form.reset({
      name: profile?.name ?? '',
      code: profile?.code ?? '',
      description: profile?.description ?? '',
      isActive: profile?.isActive ?? true,
      isDefault: profile?.isDefault ?? false,
      criteriaText: JSON.stringify(profile?.criteria ?? {}, null, 2),
    });
    this.editing.set(true);
    this.error.set(null);
    this.saved.set(false);
  }

  save(): void {
    if (this.form.invalid || this.busy()) return;
    const { criteriaText, isDefault, ...values } = this.form.getRawValue();
    let criteria: unknown;
    try {
      criteria = JSON.parse(criteriaText);
    } catch {
      this.error.set({ code: 'errors.criteriaJson' });
      return;
    }
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
      this.error.set({ code: 'errors.criteriaObject' });
      return;
    }
    const body = { ...values, isDefault: values.isActive && isDefault, criteria: criteria as Record<string, unknown> };
    const id = this.selected();
    const request = id ? this.api.profilesControllerUpdate({ id, body }) : this.api.profilesControllerCreate({ body });
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (profile) => {
        this.edit(profile);
        this.saved.set(true);
        this.load();
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.error.set(requestError(error, 'errors.saveProfile'));
        this.busy.set(false);
      },
    });
  }

  private load(): void {
    this.api.profilesControllerList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (profiles) => this.profiles.set(profiles),
      error: (error: unknown) => this.error.set(requestError(error, 'errors.loadProfiles')),
    });
  }
}

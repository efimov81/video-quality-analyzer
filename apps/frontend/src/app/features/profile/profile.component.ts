import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { returnPath, SessionService } from '../../core/auth/session.service';
import { requestError } from '../../core/i18n/request-error';

@Component({
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  readonly session = inject(SessionService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly saved = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', [Validators.required, Validators.maxLength(128)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  submit(): void {
    if (this.busy() || this.form.invalid) return;
    const required = this.session.user()?.mustChangePassword;
    this.busy.set(true);
    this.saved.set(false);
    this.error.set('');
    this.session.changePassword(this.form.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.form.reset();
        this.saved.set(true);
        this.busy.set(false);
        if (required) {
          void this.router.navigateByUrl(returnPath(this.route.snapshot.queryParamMap.get('returnUrl')), { replaceUrl: true });
        }
      },
      error: (error: unknown) => {
        this.error.set(requestError(error, 'errors.savePassword').code);
        this.busy.set(false);
      },
    });
  }
}

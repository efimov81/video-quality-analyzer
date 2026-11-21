import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { returnPath, SessionService } from '../../core/auth/session.service';
import { requestError } from '../../core/i18n/request-error';

@Component({
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly session = inject(SessionService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    login: ['', [Validators.required, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  submit(): void {
    if (this.busy() || this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    this.session.login(this.form.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user) => {
        this.form.controls.password.reset();
        this.busy.set(false);
        const url = returnPath(this.route.snapshot.queryParamMap.get('returnUrl'));
        if (user.mustChangePassword) {
          void this.router.navigate(['/profile'], { queryParams: { returnUrl: url }, replaceUrl: true });
        } else {
          void this.router.navigateByUrl(url, { replaceUrl: true });
        }
      },
      error: (error: unknown) => {
        this.error.set(requestError(error, 'errors.login').code);
        this.busy.set(false);
      },
    });
  }
}

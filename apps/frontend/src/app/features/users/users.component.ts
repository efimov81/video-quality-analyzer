import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Observable } from 'rxjs';
import type { UserResponseDto } from '../../api/generated/models/user-response-dto';
import { UsersService } from '../../api/generated/services/users.service';
import { SessionService } from '../../core/auth/session.service';
import { requestError } from '../../core/i18n/request-error';

@Component({
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit {
  readonly session = inject(SessionService);
  readonly users = signal<UserResponseDto[]>([]);
  readonly selected = signal<UserResponseDto | null>(null);
  readonly creating = signal(false);
  readonly busy = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  private readonly forms = inject(FormBuilder).nonNullable;
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(UsersService);
  readonly accountForm = this.forms.group({
    login: ['', [Validators.required, Validators.pattern(/^[a-z0-9._-]+$/), Validators.maxLength(64)]],
    displayName: ['', [Validators.required, Validators.pattern(/.*\S.*/s), Validators.maxLength(120)]],
    role: this.forms.control<UserResponseDto['role']>('user'),
    isActive: [true],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });
  readonly resetForm = this.forms.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });

  ngOnInit(): void {
    this.api.usersControllerList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (users) => this.users.set(users),
      error: (error: unknown) => this.loadError.set(requestError(error, 'errors.loadUsers').code),
    });
  }

  newUser(): void {
    this.select(null);
    this.creating.set(true);
  }

  select(user: UserResponseDto | null): void {
    this.creating.set(false);
    this.selected.set(user);
    this.error.set('');
    this.notice.set('');
    this.resetForm.reset();
    this.accountForm.reset({
      login: user?.login ?? '',
      displayName: user?.displayName ?? '',
      role: user?.role ?? 'user',
      isActive: user?.isActive ?? true,
      password: '',
    });
    for (const control of [this.accountForm.controls.login, this.accountForm.controls.password]) {
      if (user) control.disable();
      else control.enable();
    }
  }

  save(): void {
    if (this.busy() || this.accountForm.invalid) return;
    const { login, password, displayName, role, isActive } = this.accountForm.getRawValue();
    const selected = this.selected();
    const request = selected
      ? this.api.usersControllerUpdate({ id: selected.id, body: { displayName, role, isActive } })
      : this.api.usersControllerCreate({ body: { login, password, displayName, role } });
    this.mutate(request, (user) => {
      this.users.update((users) => selected
        ? users.map((item) => item.id === user.id ? user : item)
        : [...users, user]);
      this.select(user);
      this.session.updateUser(user);
      this.notice.set('auth.userSaved');
    });
  }

  resetPassword(): void {
    const selected = this.selected();
    if (!selected?.login || this.resetForm.invalid || this.busy()) return;
    this.mutate(this.api.usersControllerResetPassword({ id: selected.id, body: this.resetForm.getRawValue() }), () => {
      this.resetForm.reset();
      this.notice.set('auth.passwordReset');
    });
  }

  private mutate<T>(request: Observable<T>, done: (result: T) => void): void {
    this.busy.set(true);
    this.notice.set('');
    this.error.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.busy.set(false);
        done(result);
      },
      error: (error: unknown) => {
        this.error.set(requestError(error, 'errors.saveUser').code);
        this.busy.set(false);
      },
    });
  }
}

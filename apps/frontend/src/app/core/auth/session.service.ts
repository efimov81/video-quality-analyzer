import { inject, Injectable, signal } from '@angular/core';
import { HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, of, tap } from 'rxjs';
import type { ChangePasswordDto } from '../../api/generated/models/change-password-dto';
import type { LoginDto } from '../../api/generated/models/login-dto';
import type { UserResponseDto } from '../../api/generated/models/user-response-dto';
import { AuthService } from '../../api/generated/services/auth.service';

export const skipSessionRedirect = new HttpContextToken(() => false);

export function returnPath(value: string | null): string {
  return value && /^\/(videos|profile|users)(?:[/?#]|$)/.test(value) ? value : '/videos';
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(AuthService);
  private readonly router = inject(Router);
  private readonly currentUser = signal<UserResponseDto | null>(null);
  readonly user = this.currentUser.asReadonly();
  readonly restoreFailed = signal(false);

  async restore(): Promise<void> {
    this.restoreFailed.set(false);
    const user = await firstValueFrom(this.api.authControllerMe(undefined, new HttpContext().set(skipSessionRedirect, true)).pipe(
      catchError((error: unknown) => {
        this.restoreFailed.set(!(error instanceof HttpErrorResponse && error.status === 401));
        return of(null);
      }),
    ));
    this.currentUser.set(user);
  }

  login(body: LoginDto) {
    return this.api.authControllerLogin({ body }, new HttpContext().set(skipSessionRedirect, true))
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  changePassword(body: ChangePasswordDto) {
    return this.api.authControllerChangePassword({ body }).pipe(tap((user) => this.currentUser.set(user)));
  }

  logout() {
    return this.api.authControllerLogout().pipe(tap(() => {
      this.currentUser.set(null);
      void this.router.navigate(['/login']);
    }));
  }

  expire(): void {
    if (!this.currentUser()) return;

    this.currentUser.set(null);
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: returnPath(this.router.url) },
      replaceUrl: true,
    });
  }

  updateUser(user: UserResponseDto): void {
    if (this.currentUser()?.id === user.id) {
      if (!user.isActive) this.expire();
      else {
        this.currentUser.set(user);
        if (user.role !== 'admin' && returnPath(this.router.url).startsWith('/users')) {
          void this.router.navigate(['/videos']);
        }
      }
    }
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SessionService } from './core/auth/session.service';
import { LanguageService } from './core/i18n/language.service';

@Component({
  selector: 'vqa-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly session = inject(SessionService);
  readonly language = inject(LanguageService);
  readonly logoutFailed = signal(false);
  readonly loggingOut = signal(false);
  private readonly destroyRef = inject(DestroyRef);

  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.logoutFailed.set(false);
    this.session.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.loggingOut.set(false),
      error: () => {
        this.logoutFailed.set(true);
        this.loggingOut.set(false);
      },
    });
  }
}

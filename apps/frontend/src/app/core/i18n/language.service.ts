import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

type Language = 'en' | 'ru';
const LANGUAGE_KEY = 'vqa.language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = signal<Language>('en');

  readonly availableLanguages = ['en', 'ru'] as const;
  readonly language = this.activeLanguage.asReadonly();

  initialize(): void {
    let stored: string | null | undefined;
    try {
      stored = this.document.defaultView?.localStorage.getItem(LANGUAGE_KEY);
    } catch {
      // Storage can be blocked even when the browser exposes it.
    }
    this.apply(stored === 'ru' ? 'ru' : 'en');
    this.transloco.selectTranslate<string>('app.name')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((title) => {
        this.document.title = title;
      });
  }

  select(language: Language): void {
    this.apply(language);
    try {
      this.document.defaultView?.localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // The user can still switch languages for the current session.
    }
  }

  private apply(language: Language): void {
    this.transloco.setActiveLang(language);
    this.document.documentElement.lang = language;
    this.activeLanguage.set(language);
  }
}

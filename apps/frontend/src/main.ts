import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import localeRu from '@angular/common/locales/ru';
import { inject, isDevMode, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideTransloco, provideTranslocoMissingHandler } from '@jsverse/transloco';
import { AppComponent } from './app/app.component';
import { LanguageService } from './app/core/i18n/language.service';
import { MessageFallback, TranslationLoader } from './app/core/i18n/translation-loader';

registerLocaleData(localeRu);

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['en', 'ru'],
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        missingHandler: { useFallbackTranslation: true },
        prodMode: !isDevMode(),
      },
      loader: TranslationLoader,
    }),
    provideTranslocoMissingHandler(MessageFallback),
    provideAppInitializer(() => inject(LanguageService).initialize()),
  ],
}).catch((error: unknown) => {
  console.error('Frontend bootstrap failed.', error);
});

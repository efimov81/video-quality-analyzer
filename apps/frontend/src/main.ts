import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeRu from '@angular/common/locales/ru';
import { inject, isDevMode, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideTransloco, provideTranslocoMissingHandler } from '@jsverse/transloco';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { SessionService } from './app/core/auth/session.service';
import { sessionInterceptor } from './app/core/auth/session.interceptor';
import { LanguageService } from './app/core/i18n/language.service';
import { MessageFallback, TranslationLoader } from './app/core/i18n/translation-loader';

registerLocaleData(localeRu);

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([sessionInterceptor])),
    provideRouter(routes),
    provideAppInitializer(() => inject(SessionService).restore()),
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

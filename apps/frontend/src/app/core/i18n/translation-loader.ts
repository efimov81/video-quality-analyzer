import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Translation, TranslocoLoader, TranslocoMissingHandler, TranslocoMissingHandlerData } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(language: string) {
    return this.http.get<Translation>(`assets/i18n/${language}.json`);
  }
}

@Injectable()
export class MessageFallback implements TranslocoMissingHandler {
  handle(key: string, _data: TranslocoMissingHandlerData, params?: Record<string, unknown>): string {
    return typeof params?.['fallback'] === 'string' ? params['fallback'] : key;
  }
}

import { Pipe, PipeTransform } from '@angular/core';
import type { ApiMessageErrorDto } from '../../api/generated/models/api-message-error-dto';

@Pipe({ name: 'messageParams' })
export class MessageParamsPipe implements PipeTransform {
  transform(
    params: ApiMessageErrorDto['messageParams'] | null | undefined,
    language: string,
    fallback?: string,
  ): Record<string, string | boolean | null> {
    const formatter = new Intl.NumberFormat(language, { maximumSignificantDigits: 8 });
    const localized = Object.fromEntries(Object.entries(params ?? {}).map(([key, value]) => [
      key,
      typeof value === 'number' ? formatter.format(value) : value,
    ]));
    return fallback === undefined ? localized : { ...localized, fallback };
  }
}

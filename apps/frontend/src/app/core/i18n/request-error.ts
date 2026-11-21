import { HttpErrorResponse } from '@angular/common/http';
import type { ApiMessageErrorDto } from '../../api/generated/models/api-message-error-dto';

export interface RequestError {
  code: string;
  params?: ApiMessageErrorDto['messageParams'];
  fallback?: string;
}

export function requestError(error: unknown, fallbackCode: string): RequestError {
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  if (error instanceof HttpErrorResponse && error.status === 409 &&
    body && typeof body === 'object' && 'code' in body && body.code === 'VIDEO_ALREADY_EXISTS') {
    return { code: 'errors.videoAlreadyExists' };
  }
  if (!body || typeof body !== 'object' || !('messageCode' in body) || typeof body.messageCode !== 'string') {
    if (error instanceof HttpErrorResponse && error.status === 403) return { code: 'errors.accessDenied' };
    return { code: fallbackCode };
  }
  const params = 'messageParams' in body && body.messageParams && typeof body.messageParams === 'object'
    ? Object.fromEntries(Object.entries(body.messageParams).filter(([, value]) => (
      value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    )))
    : undefined;
  return {
    code: body.messageCode,
    params,
    fallback: 'message' in body && typeof body.message === 'string' ? body.message : undefined,
  };
}

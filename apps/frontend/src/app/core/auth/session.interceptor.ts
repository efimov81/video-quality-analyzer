import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { SessionService, skipSessionRedirect } from './session.service';

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/') || request.context.get(skipSessionRedirect)) return next(request);

  const session = inject(SessionService);
  const user = session.user();
  return next(request).pipe(tap({
    error: (error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && session.user() === user) {
        session.expire();
      }
    },
  }));
};

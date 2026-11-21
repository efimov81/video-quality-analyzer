import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { returnPath, SessionService } from './session.service';

export const requireSession: CanActivateFn = (route, state) => {
  const user = inject(SessionService).user();
  const router = inject(Router);
  if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: returnPath(state.url) } });
  if (user.mustChangePassword && route.routeConfig?.path !== 'profile') {
    return router.createUrlTree(['/profile'], { queryParams: { returnUrl: returnPath(state.url) } });
  }
  if (route.routeConfig?.path === 'users' && user.role !== 'admin') {
    return router.createUrlTree(['/forbidden']);
  }
  return true;
};

export const requireGuest: CanActivateFn = (route) => {
  const user = inject(SessionService).user();
  const router = inject(Router);
  const url = returnPath(route.queryParamMap.get('returnUrl'));
  if (!user) return true;
  if (user.mustChangePassword) return router.createUrlTree(['/profile'], { queryParams: { returnUrl: url } });
  return router.parseUrl(url);
};

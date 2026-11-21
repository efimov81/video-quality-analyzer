import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { localizedException } from '../common/api-message';
import type { SessionUser } from './auth.models';
import { AuthService } from './auth.service';

const accessKey = Symbol('access');
type Access = 'public' | 'password-change' | 'admin';
export const Access = (access: Access) => SetMetadata(accessKey, access);

export const sessionCookieName = 'vqa_session';
export const frontendOrigin = () => process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200';

export interface SessionRequest {
  method: string;
  headers: Record<string, string | undefined>;
  user?: SessionUser;
  sessionToken?: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  context.switchToHttp().getRequest<SessionRequest>().user,
);

export function sessionToken(request: SessionRequest): string | undefined {
  const cookie = request.headers.cookie?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));
  const token = cookie?.slice(sessionCookieName.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function accessDenied() {
  return localizedException(ForbiddenException, 'Нет доступа.', 'errors.accessDenied');
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<SessionRequest>();
    this.checkOrigin(request);
    const access = this.reflector.getAllAndOverride<Access>(accessKey, [context.getHandler(), context.getClass()]);
    if (access === 'public') return true;
    http.getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Cache-Control', 'no-store');

    const token = sessionToken(request);
    const user = token ? await this.auth.currentUser(token) : undefined;
    if (!user) throw localizedException(UnauthorizedException, 'Требуется вход.', 'errors.loginRequired');
    if (user.mustChangePassword && access !== 'password-change') {
      throw localizedException(ForbiddenException, 'Сначала смените пароль.', 'errors.passwordChangeRequired');
    }
    if (access === 'admin' && user.role !== 'admin') throw accessDenied();

    request.user = user;
    request.sessionToken = token;
    return true;
  }

  private checkOrigin(request: SessionRequest): void {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;

    const origin = request.headers.origin;
    if (!origin) return;

    if (URL.canParse(origin)) {
      const url = new URL(origin);
      if (['http:', 'https:'].includes(url.protocol) &&
        (url.origin === frontendOrigin() || url.host === request.headers.host)) return;
    }

    throw accessDenied();
  }
}

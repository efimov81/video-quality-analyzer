import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ChangePasswordDto, LoginDto, UserResponseDto } from './auth.dto';
import type { SessionUser } from './auth.models';
import { AuthService, sessionLifetimeMs } from './auth.service';
import { Access, CurrentUser, sessionCookieName, type SessionRequest, sessionToken } from './session.guard';

interface CookieResponse {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options: object): void;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    path: '/api',
  };
}

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Access('public')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: UserResponseDto })
  async login(@Body() body: LoginDto, @Req() request: SessionRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const { user, token } = await this.auth.login(body);
    const previousToken = sessionToken(request);
    if (previousToken) await this.auth.logout(previousToken);
    response.cookie(sessionCookieName, token, { ...cookieOptions(), maxAge: sessionLifetimeMs });
    return user;
  }

  @Get('me')
  @Access('password-change')
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth()
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  @Post('password')
  @Access('password-change')
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOkResponse({ type: UserResponseDto })
  changePassword(@CurrentUser() user: SessionUser, @Req() request: SessionRequest, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(user.id, request.sessionToken!, body);
  }

  @Post('logout')
  @Access('public')
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() request: SessionRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const token = sessionToken(request);
    if (token) await this.auth.logout(token);
    response.clearCookie(sessionCookieName, cookieOptions());
  }
}

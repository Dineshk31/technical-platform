import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, Res, UnauthorizedException, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { LoginSchema, type AuthenticatedUser, type LoginInput } from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleService } from './login-throttle.service.js';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  @Public()
  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ip = req.ip ?? 'unknown';
    const retryAfterSeconds = this.loginThrottle.isBlocked(ip);
    if (retryAfterSeconds !== null) {
      throw new HttpException(
        { error: { code: 'RATE_LIMITED', message: 'Too many failed login attempts from this network. Please try again shortly.' } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let session;
    try {
      session = await this.authService.login(body.email, body.password);
    } catch (err) {
      // Only wrong-email/wrong-password failures count toward the IP-level throttle —
      // a successful login never does (see LoginThrottleService), and neither does an
      // ACCOUNT_LOCKED rejection (that account is already locked; no need to also
      // penalize the IP for a request that couldn't have succeeded anyway).
      if (err instanceof UnauthorizedException) {
        this.loginThrottle.recordFailure(ip);
      }
      throw err;
    }

    const { accessToken, refreshToken, user } = session;
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.extractRefreshToken(req);
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token provided');
    }
    const { accessToken, refreshToken, user } = await this.authService.refreshTokens(rawToken);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Roles('ADMIN', 'STUDENT')
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.extractRefreshToken(req);
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @Roles('ADMIN', 'STUDENT')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private extractRefreshToken(req: Request): string | undefined {
    // Cookie-only by design (docs/security.md §3 — httpOnly+Secure+SameSite): no body
    // fallback, so a refresh token can never be read into JS-reachable client storage.
    return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }
}

import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { LoginSchema, type AuthenticatedUser, type LoginInput } from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() body: LoginInput, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.authService.login(body.email, body.password);
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
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (cookieToken) return cookieToken;
    const body = req.body as { refreshToken?: string } | undefined;
    return body?.refreshToken;
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

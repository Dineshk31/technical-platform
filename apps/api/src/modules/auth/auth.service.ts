import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Role, User } from '../../../generated/prisma/index.js';
import type { AuthenticatedUser, JwtAccessPayload, JwtRefreshPayload } from '@technical-platform/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IDENTITY_PROVIDER, type IdentityProvider } from './interfaces/identity-provider.interface.js';
import { hashToken } from './utils/hash-token.util.js';

type UserWithRole = User & { role: Role };

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
  ) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const identity = await this.identityProvider.validateCredentials(email, password);
    if (!identity) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Resolves the provider-agnostic identity to our internal user row — the
    // same step a future SsoIdentityProvider's result would go through.
    const user = await this.prisma.user.findFirst({
      where: identity.externalId
        ? { OR: [{ externalId: identity.externalId }, { email: identity.email }] }
        : { email: identity.email },
      include: { role: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueSession(user);
  }

  async refreshTokens(rawRefreshToken: string): Promise<AuthResult> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(rawRefreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has been revoked or expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is no longer active');
    }

    // Rotate: the presented refresh token is single-use.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(user);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: UserWithRole): Promise<AuthResult> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: toAuthenticatedUser(user) };
  }

  private signAccessToken(user: UserWithRole): string {
    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.code,
      type: 'access',
    };
    return this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') as JwtSignOptions['expiresIn'],
    });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const payload: JwtRefreshPayload = { sub: userId, type: 'refresh', jti: randomUUID() };
    const token = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') as JwtSignOptions['expiresIn'],
    });

    const decoded = this.jwtService.decode<{ exp: number }>(token);
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });

    return token;
  }
}

function toAuthenticatedUser(user: UserWithRole): AuthenticatedUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role.code };
}

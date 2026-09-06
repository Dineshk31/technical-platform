import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser, JwtAccessPayload } from '@technical-platform/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';

/**
 * Validates the access-token Bearer header on every non-public request.
 * Re-fetches the user on every request (rather than trusting the payload
 * alone) so a deactivated account is rejected immediately, not just once
 * its 15-minute access token happens to expire.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is no longer active');
    }

    return { id: user.id, email: user.email, name: user.name, role: user.role.code };
  }
}

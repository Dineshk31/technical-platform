import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { IDENTITY_PROVIDER } from './interfaces/identity-provider.interface.js';
import { LocalIdentityProvider } from './providers/local-identity.provider.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Swap this binding for an SsoIdentityProvider in Phase 12 — nothing
    // else in this module (or outside it) needs to change.
    { provide: IDENTITY_PROVIDER, useClass: LocalIdentityProvider },
  ],
})
export class AuthModule {}

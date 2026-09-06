import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@technical-platform/shared';

/**
 * The user object JwtStrategy.validate() attached to the request — never a
 * raw JWT payload, so a controller never has to know about token internals.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as AuthenticatedUser;
});

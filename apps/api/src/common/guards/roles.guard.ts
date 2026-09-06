import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, UserRoleCode } from '@technical-platform/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Deny-by-default authorization (docs/security.md §1/§3): any route that is
 * neither @Public() nor decorated with @Roles(...) is rejected. There is no
 * "authenticated but unrestricted" middle ground — every protected route
 * must say explicitly which roles may call it.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException('This route has no role policy configured');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
    return true;
  }
}

import { SetMetadata } from '@nestjs/common';
import type { UserRoleCode } from '@technical-platform/shared';

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may access a route. RolesGuard denies any non-public
 * route that has no @Roles(...) — see docs/security.md §3 (deny-by-default).
 */
export const Roles = (...roles: UserRoleCode[]) => SetMetadata(ROLES_KEY, roles);

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as not requiring authentication. Everything else is
 * authenticated-and-role-checked by default — see RolesGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

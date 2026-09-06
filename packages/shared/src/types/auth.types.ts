import type { UserRoleCode } from '../enums/role.enum.js';

/**
 * The shape every IdentityProvider implementation resolves credentials to.
 * Local auth and future SSO both normalize to this before a session is issued.
 */
export interface ExternalIdentity {
  externalId: string;
  email: string;
  name: string;
  role: UserRoleCode;
  department?: string | null;
  batch?: string | null;
}

export interface JwtAccessPayload {
  sub: string; // internal users.id
  email: string;
  role: UserRoleCode;
  type: 'access';
}

export interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRoleCode;
}

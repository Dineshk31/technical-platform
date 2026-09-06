import type { ExternalIdentity } from '@technical-platform/shared';

/**
 * The seam described in docs/integration.md: AuthService depends on this
 * interface, never on a concrete credential mechanism. Today the only
 * implementation is LocalIdentityProvider (email + password against the
 * local `users` table). A future SsoIdentityProvider validating a Centurion
 * SSO assertion is a new class implementing this same interface — no change
 * to AuthService, guards, or anything downstream of authentication.
 */
export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export interface IdentityProvider {
  validateCredentials(email: string, password: string): Promise<ExternalIdentity | null>;
}

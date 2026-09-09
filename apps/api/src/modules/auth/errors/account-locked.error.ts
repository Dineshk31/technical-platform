/**
 * Thrown by LocalIdentityProvider when an account is currently time-locked from too
 * many recent failed password attempts (docs/security.md §1). Kept as a thrown error
 * rather than widening IdentityProvider's return type so the interface stays a clean
 * swap point for a future SsoIdentityProvider, which has no concept of local lockout.
 */
export class AccountLockedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Account temporarily locked due to repeated failed login attempts');
  }
}

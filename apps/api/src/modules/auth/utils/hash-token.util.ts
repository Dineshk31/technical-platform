import { createHash } from 'node:crypto';

/**
 * Refresh tokens are stored hashed (never in plaintext) so a database read
 * can't be used to replay a session — see docs/security.md §3.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

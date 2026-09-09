import { Injectable, Logger } from '@nestjs/common';

// docs/security.md §1/§7 — per-IP throttle on POST /auth/login, complementing the
// per-account lockout in LocalIdentityProvider. Kept as a hand-rolled in-memory sliding
// window (same pattern already used for run/submit and AI-generation throttling in this
// codebase — see SubmissionsService/AiService) rather than pulling in @nestjs/throttler
// for a single endpoint.
//
// Deliberately counts only *failed* attempts, not every request: a university campus
// NAT or shared proxy can put many legitimate students behind one apparent IP, and at
// exam start they all log in — successfully — within the same short window. Counting
// successes here would throttle exactly that legitimate burst (this was caught by the
// e2e suite itself hitting the limit through ordinary successful test logins). Only
// wrong-password attempts count, so this exists purely to blunt a distributed
// credential-guessing script; a fast run of correct logins never trips it.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 30;

@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly failuresByIp = new Map<string, { count: number; windowStart: number }>();

  /** Returns seconds to wait if this IP has failed too many logins recently, otherwise null. */
  isBlocked(ip: string): number | null {
    const entry = this.failuresByIp.get(ip);
    if (!entry) return null;
    if (Date.now() - entry.windowStart >= WINDOW_MS) {
      this.failuresByIp.delete(ip);
      return null;
    }
    if (entry.count >= MAX_FAILURES_PER_WINDOW) {
      const retryAfterSeconds = Math.ceil((entry.windowStart + WINDOW_MS - Date.now()) / 1000);
      // Phase 15 — logged so a real credential-guessing burst is visible in ops
      // logs/alerting, never anything more specific than the IP itself (no email,
      // no password, no request body).
      this.logger.warn(`Login throttle active for IP ${ip} — ${entry.count} failures in the current window, retry in ${retryAfterSeconds}s`);
      return retryAfterSeconds;
    }
    return null;
  }

  recordFailure(ip: string): void {
    const now = Date.now();
    const entry = this.failuresByIp.get(ip);
    if (!entry || now - entry.windowStart >= WINDOW_MS) {
      this.failuresByIp.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }
}

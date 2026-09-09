import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { ExternalIdentity } from '@technical-platform/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { IdentityProvider } from '../interfaces/identity-provider.interface.js';
import { AccountLockedError } from '../errors/account-locked.error.js';

// docs/security.md §1 — brute-force login mitigation. A time-based lock rather than a
// permanent one: repeated guessing gets meaningfully slowed down without a support
// ticket being required to unlock a legitimate student's account before their next exam.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class LocalIdentityProvider implements IdentityProvider {
  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(email: string, password: string): Promise<ExternalIdentity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      return null;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedError(Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      return null;
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return {
      externalId: user.externalId ?? user.id,
      email: user.email,
      name: user.name,
      role: user.role.code,
      department: user.department,
      batch: user.batch,
    };
  }

  private async registerFailedAttempt(userId: string, previousCount: number): Promise<void> {
    const attempts = previousCount + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
  }
}

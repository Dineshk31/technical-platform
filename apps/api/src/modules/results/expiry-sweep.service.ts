import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { finalizeAttempt } from './results.service.js';

/**
 * Mechanism 2 of docs/assessment-system.md §3's deliberately redundant pair.
 * Per-request checks (`ensureAttemptFreshness`, unchanged since Phase 4) flip
 * an attempt to AUTO_SUBMITTED — and, since Phase 8, `ResultsService` finalizes
 * it on demand — the *moment* its own owner or an admin next touches it. This
 * sweep exists for everything else: an attempt nobody is actively looking at
 * (closed browser tab, no admin viewing that student yet) — so an expired
 * attempt is never left sitting in IN_PROGRESS indefinitely just because
 * nobody happened to request it (Phase 8 Part 3's explicit requirement).
 *
 * Deliberately simple, matching "choose the simplest reliable
 * production-quality approach" — a single in-process `@Cron` job, no external
 * scheduler/queue:
 *   - `onModuleInit` runs one pass immediately at boot — "startup recovery"
 *     for anything that expired while the API process was down.
 *   - `@Cron(EVERY_30_SECONDS)` matches the exact cadence docs/assessment-system.md
 *     §3 specifies.
 *   - `finalizeAttempt` is idempotent (see its own doc comment), so this sweep
 *     racing a student's manual submit or another sweep tick is always safe.
 */
@Injectable()
export class ExpirySweepService implements OnModuleInit {
  private readonly logger = new Logger(ExpirySweepService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.sweep();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<void> {
    if (this.running) return; // guard against overlapping ticks if a pass ever runs long
    this.running = true;
    try {
      const expired = await this.prisma.attempt.findMany({
        where: { status: 'IN_PROGRESS', endsAt: { lt: new Date() } },
        select: { id: true },
      });
      for (const attempt of expired) {
        try {
          await finalizeAttempt(this.prisma, attempt.id, 'EXPIRY');
        } catch (error) {
          this.logger.error(
            `Failed to finalize expired attempt ${attempt.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (expired.length > 0) {
        this.logger.log(`Expiry sweep finalized ${expired.length} attempt(s).`);
      }
    } finally {
      this.running = false;
    }
  }
}

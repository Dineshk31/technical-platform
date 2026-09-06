import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin client for the one thing the API ever tells the execution-service
 * directly: "something is queued, go look" (docs/coding-engine.md §3). The
 * Postgres `execution_jobs` row inserted by SubmissionsService is the actual
 * source of truth — this HTTP call is a pure latency optimization. If it
 * fails for any reason (service down, network hiccup), the execution-service's
 * own interval poller will pick the job up on its next tick regardless, so
 * failures here are logged and swallowed, never surfaced to the student as an
 * error on their Run Code click.
 */
@Injectable()
export class ExecutionClientService {
  private readonly logger = new Logger(ExecutionClientService.name);
  private readonly baseUrl: string;
  private readonly sharedSecret: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('EXECUTION_SERVICE_URL')!;
    this.sharedSecret = this.config.get<string>('EXECUTION_SERVICE_SHARED_SECRET')!;
  }

  async notify(jobId: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      try {
        await fetch(`${this.baseUrl}/internal/execution/notify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.sharedSecret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.warn(`Failed to notify execution-service for job ${jobId}; it will still be picked up by the poller: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

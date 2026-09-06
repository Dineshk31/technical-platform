import type { Pool } from 'pg';
import type { Env, ToolchainConfig } from '../config/env.js';
import {
  claimNextQueuedJob,
  finalizeSubmission,
  loadSubmissionForExecution,
  loadTestCases,
  markJobCompleted,
  markJobFailed,
  markSubmissionRunning,
  requeueJob,
} from '../db/queries.js';
import { InternalExecutionError, judgeSubmission } from './judge.js';

const SUPPORTED_LANGUAGES = new Set(['CPP', 'JAVA', 'PYTHON']);

/**
 * Drains at most one queued job per call. Called on a fixed interval
 * (guaranteed progress) and immediately after the API's internal notify call
 * (latency optimization) — see docs/coding-engine.md §3. Sequential,
 * single-job-at-a-time processing is a deliberate MVP simplification
 * ("this is a university MVP, not a HackerRank-scale distributed
 * infrastructure"); raising throughput later means running more worker
 * *processes* against the same `execution_jobs` table (SKIP LOCKED already
 * makes that safe), not rewriting this function.
 */
export async function pollOnce(pool: Pool, env: Env, toolchain: ToolchainConfig, log: (msg: string) => void): Promise<boolean> {
  const claimed = await claimNextQueuedJob(pool);
  if (!claimed) return false;

  try {
    await markSubmissionRunning(pool, claimed.submissionId);
    const submission = await loadSubmissionForExecution(pool, claimed.submissionId);
    if (!submission) {
      // The submission row is gone (shouldn't happen — ExecutionJob cascades from
      // Submission — but never crash the poller over a data anomaly).
      await finalizeSubmission(pool, {
        submissionId: claimed.submissionId,
        status: 'INTERNAL_ERROR',
        score: 0,
        testsPassed: 0,
        testsTotal: 0,
        runtimeMs: null,
        memoryKb: null,
        errorMessage: 'Submission record was not found.',
        testResults: [],
      });
      await markJobFailed(pool, claimed.jobId);
      return true;
    }

    if (!SUPPORTED_LANGUAGES.has(submission.language)) {
      await finalizeSubmission(pool, {
        submissionId: submission.id,
        status: 'INTERNAL_ERROR',
        score: 0,
        testsPassed: 0,
        testsTotal: 0,
        runtimeMs: null,
        memoryKb: null,
        errorMessage: `Unsupported language: ${submission.language}`,
        testResults: [],
      });
      await markJobFailed(pool, claimed.jobId);
      return true;
    }

    const testCases = await loadTestCases(pool, submission.questionId, submission.kind);
    const outcome = await judgeSubmission({
      language: submission.language,
      code: submission.code,
      testCases,
      timeLimitSeconds: submission.timeLimitSeconds,
      memoryLimitMb: submission.memoryLimitMb,
      toolchain,
      compileTimeoutMs: env.COMPILE_TIMEOUT_MS,
      runtimeGraceMs: env.RUNTIME_GRACE_MS,
      maxOutputBytes: env.MAX_OUTPUT_BYTES,
    });

    await finalizeSubmission(pool, {
      submissionId: submission.id,
      status: outcome.status,
      score: 0, // real scoring is Phase 7; Phase 6 (RUN) only ever reports pass/fail counts
      testsPassed: outcome.testsPassed,
      testsTotal: outcome.testsTotal,
      runtimeMs: outcome.runtimeMs,
      memoryKb: outcome.memoryKb,
      errorMessage: outcome.errorMessage,
      testResults: outcome.testResults,
    });
    await markJobCompleted(pool, claimed.jobId);
  } catch (error) {
    if (error instanceof InternalExecutionError && claimed.attemptCount < env.MAX_JOB_ATTEMPTS) {
      log(`Job ${claimed.jobId} failed with an internal error (attempt ${claimed.attemptCount}); requeueing.`);
      await requeueJob(pool, claimed.jobId);
      return true;
    }

    log(`Job ${claimed.jobId} failed permanently: ${error instanceof Error ? error.message : String(error)}`);
    await finalizeSubmission(pool, {
      submissionId: claimed.submissionId,
      status: 'INTERNAL_ERROR',
      score: 0,
      testsPassed: 0,
      testsTotal: 0,
      runtimeMs: null,
      memoryKb: null,
      errorMessage: 'The execution service encountered an internal error. Please try running again.',
      testResults: [],
    }).catch((persistError) => log(`Failed to persist INTERNAL_ERROR outcome: ${String(persistError)}`));
    await markJobFailed(pool, claimed.jobId);
  }

  return true;
}

export class JobPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly pool: Pool,
    private readonly env: Env,
    private readonly toolchain: ToolchainConfig,
    private readonly log: (msg: string) => void = console.log,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.env.POLL_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Called by the internal /notify endpoint — drains the queue immediately
   * instead of waiting for the next interval tick. Safe to call anytime;
   * `running` guards against overlapping ticks. */
  async wake(): Promise<void> {
    await this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Drain everything currently queued, not just one job, so a burst of Run
      // Code clicks doesn't wait for POLL_INTERVAL_MS between each one.
      let more = true;
      while (more) {
        more = await pollOnce(this.pool, this.env, this.toolchain, this.log);
      }
    } catch (error) {
      this.log(`Poller tick failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

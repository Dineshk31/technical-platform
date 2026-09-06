import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { SupportedLanguage } from '../runners/runner-factory.js';
import type { SubmissionStatusValue } from './types.js';

export interface ClaimedJob {
  jobId: string;
  submissionId: string;
  attemptCount: number;
}

/**
 * Atomically claims exactly one queued job, safe across multiple worker
 * instances (docs/coding-engine.md §3 — `FOR UPDATE SKIP LOCKED`, no
 * Redis/broker needed for this MVP's expected load). Returns null when there
 * is nothing to do; the caller's poll loop just tries again later.
 */
export async function claimNextQueuedJob(pool: Pool): Promise<ClaimedJob | null> {
  const result = await pool.query<{ id: string; submission_id: string; attempt_count: number }>(
    `UPDATE execution_jobs
     SET status = 'RUNNING', started_at = now(), attempt_count = attempt_count + 1
     WHERE id = (
       SELECT id FROM execution_jobs
       WHERE status = 'QUEUED'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, submission_id, attempt_count`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return { jobId: row.id, submissionId: row.submission_id, attemptCount: row.attempt_count };
}

export interface SubmissionForExecution {
  id: string;
  questionId: string;
  kind: 'RUN' | 'SUBMIT';
  language: SupportedLanguage;
  code: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
}

export async function loadSubmissionForExecution(pool: Pool, submissionId: string): Promise<SubmissionForExecution | null> {
  const result = await pool.query<{
    id: string;
    question_id: string;
    kind: 'RUN' | 'SUBMIT';
    language: SupportedLanguage;
    code: string;
    time_limit_seconds: string;
    memory_limit_mb: number;
  }>(
    `SELECT s.id, s.question_id, s.kind, s.language, s.code, cq.time_limit_seconds, cq.memory_limit_mb
     FROM submissions s
     JOIN coding_questions cq ON cq.question_id = s.question_id
     WHERE s.id = $1`,
    [submissionId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    questionId: row.question_id,
    kind: row.kind,
    language: row.language,
    code: row.code,
    timeLimitSeconds: Number(row.time_limit_seconds),
    memoryLimitMb: row.memory_limit_mb,
  };
}

/** Flips the submission to RUNNING as soon as its job is claimed, so a
 * frontend polling GET /submissions/:id sees progress instead of a stale
 * PENDING for however long compilation + execution takes. */
export async function markSubmissionRunning(pool: Pool, submissionId: string): Promise<void> {
  await pool.query(`UPDATE submissions SET status = 'RUNNING' WHERE id = $1`, [submissionId]);
}

export interface TestCaseRow {
  id: string;
  isHidden: boolean;
  input: string;
  expectedOutput: string;
  orderIndex: number;
}

/** Public-only for RUN, public+hidden for SUBMIT — enforced here by `kind`, not by
 * trusting the caller, so a future SUBMIT path reusing this worker can never leak
 * hidden test cases through a caller mistake (docs/coding-engine.md §5). */
export async function loadTestCases(pool: Pool, questionId: string, kind: 'RUN' | 'SUBMIT'): Promise<TestCaseRow[]> {
  const includeHidden = kind === 'SUBMIT';
  const result = await pool.query<{ id: string; is_hidden: boolean; input: string; expected_output: string; order_index: number }>(
    `SELECT id, is_hidden, input, expected_output, order_index
     FROM coding_test_cases
     WHERE question_id = $1 AND ($2::boolean = true OR is_hidden = false)
     ORDER BY order_index ASC`,
    [questionId, includeHidden],
  );
  return result.rows.map((r) => ({
    id: r.id,
    isHidden: r.is_hidden,
    input: r.input,
    expectedOutput: r.expected_output,
    orderIndex: r.order_index,
  }));
}

export interface TestResultInput {
  testCaseId: string;
  isHidden: boolean;
  status: SubmissionStatusValue;
  passed: boolean;
  actualOutput: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  errorMessage: string | null;
  orderIndex: number;
}

export interface FinalizeSubmissionInput {
  submissionId: string;
  status: SubmissionStatusValue;
  score: number;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  errorMessage: string | null;
  testResults: TestResultInput[];
}

/** Writes the whole outcome (submission row + every test-result row) as one
 * transaction so a poller crash mid-write can never leave a submission stuck
 * "RUNNING" with only some of its test results persisted. */
export async function finalizeSubmission(pool: Pool, input: FinalizeSubmissionInput): Promise<void> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE submissions
       SET status = $2, score = $3, tests_passed = $4, tests_total = $5,
           runtime_ms = $6, memory_kb = $7, error_message = $8, completed_at = now()
       WHERE id = $1`,
      [
        input.submissionId,
        input.status,
        input.score,
        input.testsPassed,
        input.testsTotal,
        input.runtimeMs,
        input.memoryKb,
        input.errorMessage,
      ],
    );
    // A RUN can be re-triggered (Run Code again) — Phase 6 always inserts a brand
    // new Submission row per click (see AttemptsController), never reuses one, so
    // there is nothing to clear here; this delete is defensive against that
    // invariant ever changing rather than something the current flow relies on.
    await client.query(`DELETE FROM submission_test_results WHERE submission_id = $1`, [input.submissionId]);
    for (const tr of input.testResults) {
      await client.query(
        `INSERT INTO submission_test_results
           (id, submission_id, test_case_id, is_hidden, status, passed, actual_output, runtime_ms, memory_kb, error_message, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          // Generated here (not `gen_random_uuid()`) to avoid depending on Postgres's
          // pgcrypto extension — same reasoning as the Prisma schema's own
          // `@default(uuid())` choice (see the comment at the top of schema.prisma).
          randomUUID(),
          input.submissionId,
          tr.testCaseId,
          tr.isHidden,
          tr.status,
          tr.passed,
          tr.actualOutput,
          tr.runtimeMs,
          tr.memoryKb,
          tr.errorMessage,
          tr.orderIndex,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function markJobCompleted(pool: Pool, jobId: string): Promise<void> {
  await pool.query(`UPDATE execution_jobs SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [jobId]);
}

export async function markJobFailed(pool: Pool, jobId: string): Promise<void> {
  await pool.query(`UPDATE execution_jobs SET status = 'FAILED', completed_at = now() WHERE id = $1`, [jobId]);
}

export async function requeueJob(pool: Pool, jobId: string): Promise<void> {
  await pool.query(`UPDATE execution_jobs SET status = 'QUEUED' WHERE id = $1`, [jobId]);
}

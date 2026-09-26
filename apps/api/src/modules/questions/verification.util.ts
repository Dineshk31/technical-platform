/**
 * Phase 18 — the reference-solution verification gate, as pure rules so the whole
 * policy is unit-testable in one place.
 *
 * A reference solution is verified by a VERIFY submission of its exact code run
 * against ALL of the question's tests. Its verification status is *derived* from that
 * submission's own verdict rather than stored separately, so the two can never
 * disagree: no link = UNVERIFIED, still judging = PENDING, ACCEPTED = PASSED, any
 * other verdict = FAILED.
 */
export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'PASSED' | 'FAILED';

export function solutionVerificationStatus(submission: { status: string } | null | undefined): VerificationStatus {
  if (!submission) return 'UNVERIFIED';
  if (submission.status === 'PENDING' || submission.status === 'RUNNING') return 'PENDING';
  return submission.status === 'ACCEPTED' ? 'PASSED' : 'FAILED';
}

/**
 * A question is PASSED only when it has at least one reference solution and every one
 * of them passed. Otherwise the most actionable state wins: still running, then a real
 * failure, then "never run".
 */
export function questionVerificationStatus(statuses: VerificationStatus[]): VerificationStatus {
  if (statuses.length === 0) return 'UNVERIFIED';
  if (statuses.includes('PENDING')) return 'PENDING';
  if (statuses.includes('FAILED')) return 'FAILED';
  if (statuses.includes('UNVERIFIED')) return 'UNVERIFIED';
  return 'PASSED';
}

/** The approval gate's message for a question that isn't verified yet (empty = may be approved). */
export function verificationApprovalIssues(status: VerificationStatus): { field: string; issue: string }[] {
  if (status === 'PASSED') return [];
  const issue =
    status === 'PENDING'
      ? 'reference solution verification is still running — wait for it to finish'
      : status === 'FAILED'
        ? 'a reference solution failed verification against the tests — fix the solution or the tests and verify again'
        : 'every reference solution must be verified against all tests (public and hidden) before approval';
  return [{ field: 'verification', issue }];
}

/** What a coding-question update may change that affects grading. */
export interface GradingSnapshot {
  timeLimitSeconds: number;
  memoryLimitMb: number;
  referenceSolutions: Record<string, string>;
}

/**
 * Whether an update changes anything a verification result depends on. The admin form
 * re-sends the complete question on every save, so this compares values rather than
 * treating "field present" as "field changed" — fixing a typo in the title must not
 * throw away a valid verification.
 */
export function gradingChanged(
  existing: GradingSnapshot,
  input: { timeLimitSeconds?: number; memoryLimitMb?: number; referenceSolutions?: Record<string, string> },
): boolean {
  if (input.timeLimitSeconds !== undefined && input.timeLimitSeconds !== existing.timeLimitSeconds) return true;
  if (input.memoryLimitMb !== undefined && input.memoryLimitMb !== existing.memoryLimitMb) return true;
  if (input.referenceSolutions) {
    for (const [language, code] of Object.entries(input.referenceSolutions)) {
      if (existing.referenceSolutions[language] !== code) return true;
    }
  }
  return false;
}

/** Whether a test-case edit actually changes the test (same values re-saved = no change). */
export function testCaseChanged(
  existing: { isHidden: boolean; input: string; expectedOutput: string },
  input: { isHidden?: boolean; input?: string; expectedOutput?: string },
): boolean {
  return (
    (input.isHidden !== undefined && input.isHidden !== existing.isHidden) ||
    (input.input !== undefined && input.input !== existing.input) ||
    (input.expectedOutput !== undefined && input.expectedOutput !== existing.expectedOutput)
  );
}

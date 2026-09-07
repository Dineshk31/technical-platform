import { toNum } from '../assessments/dto/assessment.dto.js';

/**
 * The single authoritative "did this submission earn marks" rule, used by both
 * the live Run/Submit result (Phase 7 — `submissions/dto/submission.dto.ts`)
 * and attempt finalization (Phase 8 — `results/results.util.ts`). MVP scoring
 * is all-or-nothing (docs/database-schema.md §5 — `coding_test_cases.weight`
 * is reserved for future partial credit, unused here): a SUBMIT earns full
 * marks iff it reached ACCEPTED (every test case, public and hidden, passed).
 * RUN never earns marks — it is a practice/debugging aid, not a graded action.
 */
export function isGradedAcceptance(kind: string, status: string): boolean {
  return kind === 'SUBMIT' && status === 'ACCEPTED';
}

/**
 * A question's marks *in a specific assessment*: `assessmentQuestion.marksOverride`
 * when set, otherwise the question bank's own `marks` — the one resolution rule
 * used everywhere marks are computed (docs/database-schema.md §5,
 * docs/api-specification.md §11 point 5). Never duplicate this ternary inline;
 * import this function instead.
 */
export function resolveQuestionMarks(marksOverride: unknown, questionMarks: unknown): number {
  return toNum(marksOverride ?? questionMarks);
}

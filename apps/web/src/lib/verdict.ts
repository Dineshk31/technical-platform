import type { SubmissionStatus } from './attempts-api';

/** Green/red/neutral classification shared by every place a verdict is shown
 * (Run/Submit results on the exam page, the results pages) — one status ->
 * one color rule, defined once. */
export function statusPillClass(status: SubmissionStatus): string {
  if (status === 'ACCEPTED') return 'pass';
  if (status === 'PENDING' || status === 'RUNNING') return 'pending';
  return 'fail';
}

/** Generic, context-free verdict labels for the results pages (which show a
 * final SUBMIT verdict, not a Run) — the exam page keeps its own
 * `RUN_STATUS_LABELS` for Run/Submit-specific wording (e.g. "all public tests
 * passed"), which doesn't apply once grading includes hidden tests too. */
export const VERDICT_LABELS: Record<SubmissionStatus, string> = {
  PENDING: 'Queued',
  RUNNING: 'Running',
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong Answer',
  COMPILATION_ERROR: 'Compilation Error',
  RUNTIME_ERROR: 'Runtime Error',
  TIME_LIMIT_EXCEEDED: 'Time Limit Exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory Limit Exceeded',
  INTERNAL_ERROR: 'Execution Failed',
};

export type QuestionResultStatus = 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';

export const QUESTION_STATUS_LABELS: Record<QuestionResultStatus, string> = {
  NOT_ATTEMPTED: 'Not attempted',
  ATTEMPTED: 'Attempted',
  SOLVED: 'Solved',
};

/** Reuses the existing `.badge-*` modifiers (StatusBadge/ApprovalBadge) rather
 * than inventing a new color scheme — same green/amber/gray vocabulary as the
 * rest of the app. */
export function questionStatusPillClass(status: QuestionResultStatus): string {
  if (status === 'SOLVED') return 'badge-active';
  if (status === 'ATTEMPTED') return 'badge-draft';
  return 'badge-archived';
}

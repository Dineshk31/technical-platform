import type { SandboxVerdict } from '../sandbox/sandbox.interface.js';
import type { SubmissionStatusValue } from '../db/types.js';

/** Per-test-case verdict -> the SubmissionStatus value stored on that test
 * result row. `OUTPUT_LIMIT_EXCEEDED` has no dedicated enum value in the
 * schema (see sandbox.interface.ts) so it folds into RUNTIME_ERROR here —
 * the distinguishing errorMessage text ("produced more output than the
 * allowed limit") is preserved on the row either way. */
export function testCaseStatus(verdict: SandboxVerdict, passed: boolean): SubmissionStatusValue {
  switch (verdict) {
    case 'OK':
      return passed ? 'ACCEPTED' : 'WRONG_ANSWER';
    case 'TIME_LIMIT_EXCEEDED':
      return 'TIME_LIMIT_EXCEEDED';
    case 'MEMORY_LIMIT_EXCEEDED':
      return 'MEMORY_LIMIT_EXCEEDED';
    case 'OUTPUT_LIMIT_EXCEEDED':
    case 'RUNTIME_ERROR':
      return 'RUNTIME_ERROR';
    case 'INTERNAL_ERROR':
      return 'INTERNAL_ERROR';
  }
}

// docs/coding-engine.md §5 — worst-case-wins, in this exact priority order.
// INTERNAL_ERROR is deliberately absent: it is handled upstream as a whole-job
// retry (judge.ts throws InternalExecutionError), never rolled into this rollup.
const PRIORITY: SubmissionStatusValue[] = [
  'COMPILATION_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'WRONG_ANSWER',
  'ACCEPTED',
];

export function worstStatus(statuses: SubmissionStatusValue[]): SubmissionStatusValue {
  for (const candidate of PRIORITY) {
    if (statuses.includes(candidate)) return candidate;
  }
  return 'ACCEPTED';
}

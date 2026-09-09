import type { SubmissionStatus } from '../../lib/attempts-api';

export const RUN_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: 'Queued…',
  RUNNING: 'Running…',
  ACCEPTED: 'Accepted — all public tests passed',
  WRONG_ANSWER: 'Wrong Answer',
  COMPILATION_ERROR: 'Compilation Error',
  RUNTIME_ERROR: 'Runtime Error',
  TIME_LIMIT_EXCEEDED: 'Time Limit Exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory Limit Exceeded',
  INTERNAL_ERROR: 'Execution failed — please try again',
};

export const HISTORY_KIND_LABEL: Record<'RUN' | 'SUBMIT', string> = { RUN: 'Run', SUBMIT: 'Submit' };

// Mirrors the Prisma `submission_status` enum (apps/api/prisma/schema.prisma) —
// duplicated here (not imported from generated Prisma output) because packages/shared
// has no dependency on the API's generated client, per docs/architecture.md's
// "interfaces before providers" boundary: the frontend and execution-service both need
// this set without depending on the API's Prisma output.
export const SUBMISSION_STATUSES = [
  'PENDING',
  'RUNNING',
  'ACCEPTED',
  'WRONG_ANSWER',
  'COMPILATION_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
] as const;
export type SubmissionStatusCode = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_KINDS = ['RUN', 'SUBMIT'] as const;
export type SubmissionKindCode = (typeof SUBMISSION_KINDS)[number];

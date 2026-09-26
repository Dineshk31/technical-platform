// Mirrors the Prisma `submission_kind` enum. VERIFY (Phase 18) is an admin-only run of a
// question's reference solution against ALL tests — judged exactly like SUBMIT, but its
// hidden-test output is kept so an admin can see why verification failed.
export type SubmissionKindValue = 'RUN' | 'SUBMIT' | 'VERIFY';

// Mirrors the Prisma `submission_status` enum (apps/api/prisma/schema.prisma).
// This service talks to Postgres via `pg` directly (see db/pool.ts), not the
// API's generated Prisma client, so the value set is duplicated here rather
// than imported across the app boundary.
export type SubmissionStatusValue =
  | 'PENDING'
  | 'RUNNING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'COMPILATION_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

import type { AssessmentStatusCode } from '@technical-platform/shared';

/**
 * The stored `status` column is admin-authoritative for DRAFT/PUBLISHED/ARCHIVED
 * (those only change via an explicit admin action). ACTIVE/COMPLETED are derived
 * from the time window — see docs/assessment-system.md §1 ("status is derived,
 * not just stored"). The actual mutating cron sweep that flips a PUBLISHED row to
 * COMPLETED in the database, and auto-submits in-progress attempts, is Phase 4
 * work; until then this function is what every read/authorization check uses so
 * behavior is already correct without that stored-column mutation existing yet.
 */
export function computeEffectiveStatus(assessment: {
  status: AssessmentStatusCode;
  startAt: Date;
  endAt: Date;
}): AssessmentStatusCode {
  if (assessment.status !== 'PUBLISHED') {
    return assessment.status;
  }
  const now = new Date();
  if (now < assessment.startAt) return 'PUBLISHED';
  if (now <= assessment.endAt) return 'ACTIVE';
  return 'COMPLETED';
}

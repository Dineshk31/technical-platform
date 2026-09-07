import { toNum } from '../../assessments/dto/assessment.dto.js';
import type { FullBreakdown } from '../results.service.js';

type AttemptLike = {
  status: string;
  startedAt: Date;
  endsAt: Date;
  submittedAt: Date | null;
};

type AssessmentLike = { id: string; title: string };

/**
 * The one response shape for both the student's own result (GET
 * /assessments/:id/result) and the admin per-attempt detail (GET
 * /assessments/:id/results/:attemptId) — same data, different authorization
 * gate in ResultsService, so there is exactly one place this shape is defined.
 */
export function toOverallResult(assessment: AssessmentLike, attempt: AttemptLike, breakdown: FullBreakdown, finalizedAt: Date | null) {
  return {
    assessmentId: assessment.id,
    assessmentTitle: assessment.title,
    attemptStatus: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    endedAt: attempt.endsAt,
    totalScore: breakdown.totalScore,
    maxScore: breakdown.maxScore,
    percentage: breakdown.percentage,
    questionsSolved: breakdown.questionsSolved,
    questionsAttempted: breakdown.questionsAttempted,
    totalQuestions: breakdown.totalQuestions,
    timeTakenSeconds: breakdown.timeTakenSeconds,
    finalizedAt,
    sections: breakdown.sections,
  };
}

type ParticipantLike = {
  userId: string;
  user: { name: string; email: string };
};

type AttemptWithResult = {
  id: string;
  status: string;
  submittedAt: Date | null;
  result: { totalScore: unknown; maxScore: unknown; percentage: unknown } | null;
} | null;

/**
 * GET /assessments/:id/results — one roster row. Built from the *persisted*
 * `results` row (not recomputed here) — see ResultsService.listResults for why:
 * a paginated roster of potentially many attempts reads O(1) queries of
 * already-finalized totals rather than re-aggregating every attempt's
 * submissions on every page load. A participant with no attempt yet, or an
 * attempt not yet finalized, correctly shows `null` scores — never a
 * fabricated 0 (docs: "Do NOT invent misleading statistics").
 */
export function toAdminResultListItem(participant: ParticipantLike, attempt: AttemptWithResult) {
  const result = attempt?.result ?? null;
  return {
    userId: participant.userId,
    studentName: participant.user.name,
    studentEmail: participant.user.email,
    attemptId: attempt?.id ?? null,
    attemptStatus: attempt?.status ?? 'NOT_STARTED',
    totalScore: result ? toNum(result.totalScore) : null,
    maxScore: result ? toNum(result.maxScore) : null,
    percentage: result ? toNum(result.percentage) : null,
    submittedAt: attempt?.submittedAt ?? null,
  };
}

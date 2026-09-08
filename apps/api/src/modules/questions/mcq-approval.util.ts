import type { Prisma } from '../../../generated/prisma/index.js';

type McqApprovalCheckSource = Prisma.McqQuestionGetPayload<{ include: { options: true } }>;

/**
 * Mirrors the McqQuestionFieldsSchema Zod refinements (packages/shared) as a defensive,
 * server-side re-check — the same "don't trust an earlier validation pass alone" posture
 * already applied to coding questions. Used by both QuestionsService.review (approval
 * time) and AssessmentsService.publish (the same reason coding's publish-time re-check
 * exists: `updateMcq`'s partial UpdateMcqQuestionSchema has no cross-field refine, so an
 * already-APPROVED question's options could in principle be edited into an invalid state
 * without its approval_status changing — publish is the last gate before students see it).
 *
 * A standalone file (not a method on QuestionsService) so AssessmentsService can import it
 * without creating a circular module dependency — QuestionsService already imports
 * AssessmentsService's `recomputeMaxMarks`, so the reverse direction would cycle.
 */
export function validateMcqForApproval(mq: McqApprovalCheckSource): { field?: string; issue: string }[] {
  const details: { field?: string; issue: string }[] = [];
  if (mq.options.length < 2) {
    details.push({ field: 'options', issue: 'at least two options are required to approve' });
  }
  const correctCount = mq.options.filter((o) => o.isCorrect).length;
  if (mq.mcqType === 'MULTIPLE_CHOICE') {
    if (correctCount < 1) {
      details.push({ field: 'options', issue: 'MULTIPLE_CHOICE needs at least one correct option' });
    }
  } else if (correctCount !== 1) {
    details.push({ field: 'options', issue: 'single-answer MCQs need exactly one correct option' });
  }
  return details;
}

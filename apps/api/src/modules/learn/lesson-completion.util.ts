/**
 * Phase 18 — when does a lesson count as passed? Kept as pure rules so the policy is
 * unit-tested in one place and shared by every read and write path in LearnService.
 */

type LinkLike = { role: string; question: { type: string; approvalStatus: string } };

/**
 * The checks a student must pass: CHECK links to approved MCQs. A check whose question
 * was later un-approved stops being served *and* stops being required, so an admin
 * edit can never leave a student stuck on a question they can't see.
 */
export function isRequiredCheck(link: LinkLike): boolean {
  return link.role === 'CHECK' && link.question.type === 'MCQ' && link.question.approvalStatus === 'APPROVED';
}

/** Practice links a student is shown: approved coding problems only. */
export function isServedPractice(link: LinkLike): boolean {
  return link.role === 'PRACTICE' && link.question.type === 'CODING' && link.question.approvalStatus === 'APPROVED';
}

export interface CheckProgress {
  total: number;
  passed: number;
}

export function checkProgress(requiredQuestionIds: string[], responses: { questionId: string; isCorrect: boolean }[]): CheckProgress {
  const correct = new Set(responses.filter((r) => r.isCorrect).map((r) => r.questionId));
  return { total: requiredQuestionIds.length, passed: requiredQuestionIds.filter((id) => correct.has(id)).length };
}

/** A lesson with checks is passed only when every required check is answered correctly. */
export function passedAllChecks(progress: CheckProgress): boolean {
  return progress.total > 0 && progress.passed === progress.total;
}

/** "Mark complete" is only for lessons without checks — with checks, passing them is the completion. */
export function canSelfComplete(progress: CheckProgress): boolean {
  return progress.total === 0;
}

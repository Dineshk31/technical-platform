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

type OrderedLesson = { id: string; topic: string; title: string };

/**
 * "Continue learning" — driven by the student's most recent real activity: completing a
 * lesson, or answering one of its knowledge checks. Walking that activity newest-first:
 *   - activity on a lesson that isn't complete yet → resume that exact lesson (they
 *     stopped partway through its checks);
 *   - activity on a completed lesson → the next uncompleted lesson in the same topic,
 *     if there is one.
 * A topic the student never touched is never suggested — Learn is optional, so there is
 * nothing to "continue" there. `lessons` must be ordered by orderIndex within a topic.
 */
export function pickContinueLesson(
  lessons: OrderedLesson[],
  completedAtById: Map<string, Date>,
  checkActivity: { lessonId: string; at: Date }[],
): { lessonId: string; title: string; topic: string; lastActivityAt: Date } | null {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const activity = [
    ...[...completedAtById].map(([lessonId, at]) => ({ lessonId, at })),
    ...checkActivity,
  ]
    .filter((a) => byId.has(a.lessonId))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  for (const { lessonId, at } of activity) {
    const lesson = byId.get(lessonId)!;
    if (!completedAtById.has(lessonId)) {
      return { lessonId, title: lesson.title, topic: lesson.topic, lastActivityAt: at };
    }
    const next = lessons.find((l) => l.topic === lesson.topic && !completedAtById.has(l.id));
    if (next) return { lessonId: next.id, title: next.title, topic: next.topic, lastActivityAt: at };
  }
  return null;
}

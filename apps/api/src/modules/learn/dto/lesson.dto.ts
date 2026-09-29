import type { Lesson } from '../../../../generated/prisma/index.js';
import { questionVerificationStatus, solutionVerificationStatus } from '../../questions/verification.util.js';
import type { CheckProgress } from '../lesson-completion.util.js';

type LinkRole = 'CHECK' | 'PRACTICE';

/** Admin list row — no full content (concept/example/commonMistakes), matching
 * the same "list is narrow, detail loads the rest" shape as
 * toAdminQuestionListItem/toPracticeQuestionListItem. */
export function toAdminLessonListItem(lesson: Lesson & { questionLinks?: { role: LinkRole }[] }) {
  const links = lesson.questionLinks ?? [];
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    orderIndex: lesson.orderIndex,
    isPublished: lesson.isPublished,
    checkCount: links.filter((l) => l.role === 'CHECK').length,
    practiceCount: links.filter((l) => l.role === 'PRACTICE').length,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

export type AdminLessonLinkSource = {
  role: LinkRole;
  orderIndex: number;
  question: {
    id: string;
    title: string;
    type: string;
    difficulty: string;
    topics: string[];
    approvalStatus: string;
    codingQuestion: { referenceSolutions: { verificationSubmission: { status: string } | null }[] } | null;
  };
};

/** Admin detail — every authored field plus the attached questions with their current
 * approval/verification state, so the editor can flag a link that has gone stale. */
export function toAdminLessonDetail(lesson: Lesson & { questionLinks?: AdminLessonLinkSource[] }) {
  const links = (lesson.questionLinks ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const toLinked = (l: AdminLessonLinkSource) => ({
    questionId: l.question.id,
    title: l.question.title,
    type: l.question.type,
    difficulty: l.question.difficulty,
    topics: l.question.topics,
    approvalStatus: l.question.approvalStatus,
    verificationStatus: l.question.codingQuestion
      ? questionVerificationStatus(l.question.codingQuestion.referenceSolutions.map((rs) => solutionVerificationStatus(rs.verificationSubmission)))
      : null,
  });
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    objectives: lesson.objectives,
    concept: lesson.concept,
    example: lesson.example,
    commonMistakes: lesson.commonMistakes,
    orderIndex: lesson.orderIndex,
    isPublished: lesson.isPublished,
    checks: links.filter((l) => l.role === 'CHECK').map(toLinked),
    practice: links.filter((l) => l.role === 'PRACTICE').map(toLinked),
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

/** Student-facing topic list row — real per-topic lesson/completed counts,
 * same aggregation shape as PracticeService.getProgress().byTopic. */
export interface LearnTopicSummary {
  topic: string;
  totalLessons: number;
  completedLessons: number;
}

/** Student-facing lesson list row (within a topic) — no full content, just
 * enough to render a list with a completed / checks-passed indicator. */
export function toStudentLessonListItem(lesson: Lesson, completed: boolean, checks: CheckProgress) {
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    orderIndex: lesson.orderIndex,
    objectivesCount: lesson.objectives.length,
    checksTotal: checks.total,
    checksPassed: checks.passed,
    completed,
  };
}

export type StudentCheckSource = {
  questionId: string;
  mcqType: string;
  questionText: string;
  codeSnippet: string | null;
  explanation: string | null;
  // Deliberately never includes isCorrect — see toStudentCheck.
  options: { id: string; optionText: string; orderIndex: number }[];
};

export type StudentCheckResponse = { selectedOptionIds: string[]; isCorrect: boolean; attemptCount: number };

/**
 * One knowledge check as a student sees it. Correctness can only ever come from the
 * student's own graded response: options carry no isCorrect flag, and the explanation
 * (which usually gives the answer away) is withheld until they have answered.
 */
export function toStudentCheck(check: StudentCheckSource, response: StudentCheckResponse | null) {
  return {
    questionId: check.questionId,
    mcqType: check.mcqType,
    multiple: check.mcqType === 'MULTIPLE_CHOICE',
    questionText: check.questionText,
    codeSnippet: check.codeSnippet,
    options: check.options
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => ({ id: o.id, optionText: o.optionText })),
    answer: response
      ? {
          selectedOptionIds: response.selectedOptionIds,
          isCorrect: response.isCorrect,
          attemptCount: response.attemptCount,
          explanation: check.explanation,
        }
      : null,
  };
}

/** Student-facing lesson detail — the full reading experience. Only ever
 * built from a lesson already confirmed isPublished (see LearnService). */
export function toStudentLessonDetail(
  lesson: Lesson,
  completed: boolean,
  extras: {
    checks: ReturnType<typeof toStudentCheck>[];
    checkProgress: CheckProgress;
    practice: { questionId: string; title: string; difficulty: string; status: 'SOLVED' | 'ATTEMPTED' | 'NOT_ATTEMPTED' }[];
  },
) {
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    objectives: lesson.objectives,
    concept: lesson.concept,
    example: lesson.example,
    commonMistakes: lesson.commonMistakes,
    completed,
    checks: extras.checks,
    checksTotal: extras.checkProgress.total,
    checksPassed: extras.checkProgress.passed,
    practice: extras.practice,
  };
}

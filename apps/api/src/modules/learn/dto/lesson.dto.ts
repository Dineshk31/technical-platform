import type { Lesson } from '../../../../generated/prisma/index.js';

/** Admin list row — no full content (concept/example/commonMistakes), matching
 * the same "list is narrow, detail loads the rest" shape as
 * toAdminQuestionListItem/toPracticeQuestionListItem. */
export function toAdminLessonListItem(lesson: Lesson) {
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    orderIndex: lesson.orderIndex,
    isPublished: lesson.isPublished,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

/** Admin detail — every authored field, for the edit form. Never filtered by
 * isPublished (an admin can open a draft lesson to keep editing it). */
export function toAdminLessonDetail(lesson: Lesson) {
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    concept: lesson.concept,
    example: lesson.example,
    commonMistakes: lesson.commonMistakes,
    orderIndex: lesson.orderIndex,
    isPublished: lesson.isPublished,
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
 * enough to render a list with a completed/not indicator. */
export function toStudentLessonListItem(lesson: Lesson, completed: boolean) {
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    orderIndex: lesson.orderIndex,
    completed,
  };
}

/** Student-facing lesson detail — the full reading experience. Only ever
 * built from a lesson already confirmed isPublished (see LearnService). */
export function toStudentLessonDetail(lesson: Lesson, completed: boolean) {
  return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summary: lesson.summary,
    concept: lesson.concept,
    example: lesson.example,
    commonMistakes: lesson.commonMistakes,
    completed,
  };
}

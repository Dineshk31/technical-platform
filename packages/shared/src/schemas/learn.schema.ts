import { z } from 'zod';
import { TOPICS } from '../enums/question.enum.js';

// Fields shared by create/update — topic is validated against the shared TOPICS
// catalog (Phase 18), the same vocabulary questions use, so a lesson's topic always
// lines up with its knowledge checks, practice problems and assessment analysis.
export const LessonFieldsSchema = z.object({
  topic: z.enum(TOPICS),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  concept: z.string().trim().min(1).max(20000),
  example: z.string().trim().max(20000).optional(),
  commonMistakes: z.string().trim().max(5000).optional(),
  orderIndex: z.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
  // Phase 18 — "What you'll learn" outcomes, and questions deliberately attached to the
  // lesson: approved MCQs as knowledge checks, approved + verified coding problems as
  // "Practice what you just learned". Server-side checks enforce type/approval/verification.
  objectives: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  checkQuestionIds: z.array(z.string().uuid()).max(10).optional(),
  practiceQuestionIds: z.array(z.string().uuid()).max(10).optional(),
});

const noDuplicateLinks = (data: { checkQuestionIds?: string[]; practiceQuestionIds?: string[] }) => {
  const all = [...(data.checkQuestionIds ?? []), ...(data.practiceQuestionIds ?? [])];
  return new Set(all).size === all.length;
};
const noDuplicateLinksMessage = { message: 'A question can only be attached to a lesson once', path: ['checkQuestionIds'] };

export const CreateLessonSchema = LessonFieldsSchema.refine(noDuplicateLinks, noDuplicateLinksMessage);
export type CreateLessonInput = z.infer<typeof CreateLessonSchema>;

export const UpdateLessonSchema = LessonFieldsSchema.partial().refine(noDuplicateLinks, noDuplicateLinksMessage);
export type UpdateLessonInput = z.infer<typeof UpdateLessonSchema>;

// Admin list — same filter/pagination shape as ListQuestionsQuerySchema.
export const ListLessonsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  topic: z.enum(TOPICS).optional(),
  isPublished: z.coerce.boolean().optional(),
});
export type ListLessonsQueryInput = z.infer<typeof ListLessonsQuerySchema>;

// Phase 18 — a student's answer to one knowledge check (graded on the server).
export const AnswerLessonCheckSchema = z.object({
  optionIds: z.array(z.string().uuid()).min(1).max(8),
});
export type AnswerLessonCheckInput = z.infer<typeof AnswerLessonCheckSchema>;

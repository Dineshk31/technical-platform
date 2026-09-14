import { z } from 'zod';
import { CODING_TOPICS } from '../enums/question.enum.js';

// Fields shared by create/update — topic is validated against the exact same
// CODING_TOPICS vocabulary Question.topics already uses (see
// docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md §7), so a lesson's topic always
// lines up with a real, filterable Practice Explorer topic.
export const LessonFieldsSchema = z.object({
  topic: z.enum(CODING_TOPICS),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  concept: z.string().trim().min(1).max(20000),
  example: z.string().trim().max(20000).optional(),
  commonMistakes: z.string().trim().max(5000).optional(),
  orderIndex: z.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
});

export const CreateLessonSchema = LessonFieldsSchema;
export type CreateLessonInput = z.infer<typeof CreateLessonSchema>;

export const UpdateLessonSchema = LessonFieldsSchema.partial();
export type UpdateLessonInput = z.infer<typeof UpdateLessonSchema>;

// Admin list — same filter/pagination shape as ListQuestionsQuerySchema.
export const ListLessonsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  topic: z.enum(CODING_TOPICS).optional(),
  isPublished: z.coerce.boolean().optional(),
});
export type ListLessonsQueryInput = z.infer<typeof ListLessonsQuerySchema>;

import { z } from 'zod';
import { CODING_TOPICS, DIFFICULTY_LEVELS, PROGRAMMING_LANGUAGES } from '../enums/question.enum.js';

// Student-facing list query for /practice/questions — deliberately narrower than
// ListQuestionsQuerySchema (no approvalStatus/source filters — those are admin review-queue
// concerns, and this route only ever returns APPROVED CODING questions regardless of what's
// asked for, enforced in PracticeService, not by trusting this schema).
export const PracticeQuestionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  topic: z.enum(CODING_TOPICS).optional(),
  language: z.enum(PROGRAMMING_LANGUAGES).optional(),
  status: z.enum(['SOLVED', 'ATTEMPTED', 'UNSOLVED']).optional(),
});
export type PracticeQuestionQueryInput = z.infer<typeof PracticeQuestionQuerySchema>;

export const PracticeSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PracticeSubmissionsQueryInput = z.infer<typeof PracticeSubmissionsQuerySchema>;

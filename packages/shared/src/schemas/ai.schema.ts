import { z } from 'zod';
import { CODING_TOPICS, DIFFICULTY_LEVELS, PROGRAMMING_LANGUAGES } from '../enums/question.enum.js';
import { CodingQuestionFieldsSchema, CreateCodingQuestionSchema, TestCaseInputSchema } from './question.schema.js';

/**
 * Admin-submitted generation request (POST /ai/questions/generate). `count` is
 * capped at 10 — one Gemini call per batch, not one per question (docs/ai-integration.md
 * §6) — to keep free-tier usage bounded and predictable.
 */
export const GenerateCodingQuestionsSchema = z.object({
  topic: z.enum(CODING_TOPICS),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  language: z.enum(PROGRAMMING_LANGUAGES),
  count: z.number().int().min(1).max(10),
  concepts: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  additionalInstructions: z.string().trim().max(1000).optional(),
  marks: z.number().positive().max(1000).optional(),
  timeLimitSeconds: z.number().positive().max(10).optional(),
  memoryLimitMb: z.number().int().positive().max(1024).optional(),
});
export type GenerateCodingQuestionsInput = z.infer<typeof GenerateCodingQuestionsSchema>;

/**
 * Shape of one AI-generated candidate, re-validated server-side after Gemini
 * returns it (docs/ai-integration.md §5 — Gemini's own structured-output
 * constraint is a best-effort optimization, never trusted alone). Extends the
 * exact same field set used for manual question creation
 * (`CodingQuestionFieldsSchema`) plus `solutionApproach`, a preview-only field
 * with no column in `coding_questions` — shown to the admin during review and
 * dropped before a draft is persisted (see `SaveGeneratedQuestionsSchema`,
 * which reuses `CreateCodingQuestionSchema` and therefore has no such field).
 */
export const AIGeneratedCodingQuestionSchema = CodingQuestionFieldsSchema.extend({
  publicTestCases: z.array(TestCaseInputSchema).min(1).max(20),
  hiddenTestCases: z.array(TestCaseInputSchema).min(1).max(20),
  solutionApproach: z.string().trim().max(3000).optional(),
})
  .refine((data) => Object.keys(data.referenceSolutions).length > 0, {
    message: 'At least one reference solution is required',
    path: ['referenceSolutions'],
  })
  .refine(
    (data) => Object.keys(data.referenceSolutions).some((lang) => (data.supportedLanguages as string[]).includes(lang)),
    { message: 'At least one reference solution must match a supported language', path: ['referenceSolutions'] },
  );
export type AIGeneratedCodingQuestion = z.infer<typeof AIGeneratedCodingQuestionSchema>;

/** One failed-validation candidate, surfaced to the admin instead of silently dropped. */
export interface FailedGenerationItem {
  index: number;
  issues: string[];
}

/**
 * POST /ai/questions/requests/:id/save body. Every item must independently
 * satisfy the same bar as a manually authored question (`CreateCodingQuestionSchema`)
 * — an admin can edit any field of a draft before saving, and the saved result is
 * validated identically regardless of source (docs/question-system.md §4).
 */
export const SaveGeneratedQuestionsSchema = z.object({
  questions: z.array(CreateCodingQuestionSchema).min(1).max(10),
});
export type SaveGeneratedQuestionsInput = z.infer<typeof SaveGeneratedQuestionsSchema>;

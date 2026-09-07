import { z } from 'zod';
import {
  APPROVAL_STATUS_CODES,
  CODING_TOPICS,
  DIFFICULTY_LEVELS,
  PROGRAMMING_LANGUAGES,
  QUESTION_SOURCE_CODES,
} from '../enums/question.enum.js';

const ExampleSchema = z.object({
  input: z.string().trim().min(1).max(5000),
  output: z.string().trim().min(1).max(5000),
  explanation: z.string().trim().max(5000).optional(),
});

export const TestCaseInputSchema = z.object({
  input: z.string().min(1).max(20000),
  expectedOutput: z.string().min(1).max(20000),
});

const LANGUAGE_VALUES = PROGRAMMING_LANGUAGES as readonly string[];

function languageCodeMapSchema(fieldLabel: string) {
  return z
    .record(z.string(), z.string().trim().min(1).max(20000))
    .default({})
    .refine((values) => Object.keys(values).every((lang) => LANGUAGE_VALUES.includes(lang)), {
      message: `${fieldLabel} keys must be one of the supported programming languages`,
    });
}

const ReferenceSolutionsSchema = languageCodeMapSchema('Reference solution');
// Optional per docs/coding-engine.md — a question with none just falls back to the
// generic per-language template (packages/shared/src/utils/starter-templates.ts).
const StarterTemplatesSchema = languageCodeMapSchema('Starter template');

// Exported so the AI generation schema (schemas/ai.schema.ts) can extend the exact
// same field set instead of redefining it — one definition, not two that could drift
// (docs/ai-integration.md §5).
export const CodingQuestionFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  problemStatement: z.string().trim().min(1).max(20000),
  inputFormat: z.string().trim().min(1).max(5000),
  outputFormat: z.string().trim().min(1).max(5000),
  constraints: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  examples: z.array(ExampleSchema).min(1).max(20),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  topics: z.array(z.enum(CODING_TOPICS)).min(1).max(10),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  marks: z.number().positive().max(1000),
  timeLimitSeconds: z.number().positive().max(10),
  memoryLimitMb: z.number().int().positive().max(1024),
  supportedLanguages: z.array(z.enum(PROGRAMMING_LANGUAGES)).min(1),
  referenceSolutions: ReferenceSolutionsSchema,
  starterTemplates: StarterTemplatesSchema,
});

export const CreateCodingQuestionSchema = CodingQuestionFieldsSchema.extend({
  publicTestCases: z.array(TestCaseInputSchema).min(1).max(50),
  hiddenTestCases: z.array(TestCaseInputSchema).min(1).max(50),
})
  .refine((data) => Object.keys(data.referenceSolutions).length > 0, {
    message: 'At least one reference solution is required',
    path: ['referenceSolutions'],
  })
  .refine(
    (data) => Object.keys(data.referenceSolutions).some((lang) => (data.supportedLanguages as string[]).includes(lang)),
    { message: 'At least one reference solution must match a supported language', path: ['referenceSolutions'] },
  );
export type CreateCodingQuestionInput = z.infer<typeof CreateCodingQuestionSchema>;

export const UpdateCodingQuestionSchema = CodingQuestionFieldsSchema.partial();
export type UpdateCodingQuestionInput = z.infer<typeof UpdateCodingQuestionSchema>;

export const ListQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  topic: z.enum(CODING_TOPICS).optional(),
  approvalStatus: z.enum(APPROVAL_STATUS_CODES).optional(),
  language: z.enum(PROGRAMMING_LANGUAGES).optional(),
  source: z.enum(QUESTION_SOURCE_CODES).optional(),
});
export type ListQuestionsQueryInput = z.infer<typeof ListQuestionsQuerySchema>;

export const CreateTestCaseSchema = z.object({
  isHidden: z.boolean(),
  input: z.string().min(1).max(20000),
  expectedOutput: z.string().min(1).max(20000),
  orderIndex: z.number().int().min(0).optional(),
});
export type CreateTestCaseInput = z.infer<typeof CreateTestCaseSchema>;

export const UpdateTestCaseSchema = z.object({
  isHidden: z.boolean().optional(),
  input: z.string().min(1).max(20000).optional(),
  expectedOutput: z.string().min(1).max(20000).optional(),
  orderIndex: z.number().int().min(0).optional(),
});
export type UpdateTestCaseInput = z.infer<typeof UpdateTestCaseSchema>;

export const ReviewQuestionSchema = z.object({
  status: z.enum(APPROVAL_STATUS_CODES),
  notes: z.string().trim().max(2000).optional(),
});
export type ReviewQuestionInput = z.infer<typeof ReviewQuestionSchema>;

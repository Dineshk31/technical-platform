import { z } from 'zod';
import {
  APPROVAL_STATUS_CODES,
  CODING_TOPICS,
  DIFFICULTY_LEVELS,
  MCQ_TOPICS,
  MCQ_TYPES,
  PROGRAMMING_LANGUAGES,
  QUESTION_SOURCE_CODES,
  QUESTION_TYPE_CODES,
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
  // Relaxed from `z.enum(CODING_TOPICS)` to a plain string: the Question Bank now lists
  // both CODING and MCQ questions, which draw from two different fixed topic lists
  // (CODING_TOPICS / MCQ_TOPICS) — a single query param has no way to know which list
  // applies without also knowing `type`, so validation is left to "non-empty string" and
  // an unrecognized value simply matches nothing (Prisma `topics.has()`), not a 400.
  topic: z.string().trim().min(1).max(100).optional(),
  approvalStatus: z.enum(APPROVAL_STATUS_CODES).optional(),
  language: z.enum(PROGRAMMING_LANGUAGES).optional(),
  source: z.enum(QUESTION_SOURCE_CODES).optional(),
  type: z.enum(QUESTION_TYPE_CODES).optional(),
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

// ============================================================
// Technical MCQ (Phase 11)
// ============================================================

export const McqOptionInputSchema = z.object({
  optionText: z.string().trim().min(1).max(1000),
  // Admin-only shape (see docs/security.md §2) — orderIndex is NOT client-supplied;
  // it is derived from array position server-side, which also makes "no duplicate/
  // invalid option ordering" trivially true by construction rather than a rule to check.
  isCorrect: z.boolean().default(false),
});
export type McqOptionInput = z.infer<typeof McqOptionInputSchema>;

// Exported so a future AI-generated MCQ schema (mirroring packages/shared/src/schemas/ai.schema.ts's
// reuse of CodingQuestionFieldsSchema) can extend this same field set without redefining it.
export const McqQuestionFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    mcqType: z.enum(MCQ_TYPES),
    questionText: z.string().trim().min(1).max(5000),
    codeSnippet: z.string().trim().max(20000).optional(),
    explanation: z.string().trim().max(5000).optional(),
    difficulty: z.enum(DIFFICULTY_LEVELS),
    topics: z.array(z.enum(MCQ_TOPICS)).min(1).max(5),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    marks: z.number().positive().max(1000),
    // default 0 = no negative marking, matching coding_questions'-sibling column default.
    negativeMarkingValue: z.number().min(0).max(1000).default(0),
    options: z.array(McqOptionInputSchema).min(2).max(8),
  })
  .refine(
    (data) => {
      const correctCount = data.options.filter((o) => o.isCorrect).length;
      return data.mcqType === 'MULTIPLE_CHOICE' ? correctCount >= 1 : correctCount === 1;
    },
    {
      message: 'Single-answer MCQs need exactly one correct option; MULTIPLE_CHOICE needs at least one',
      path: ['options'],
    },
  )
  .refine(
    (data) => {
      const normalized = data.options.map((o) => o.optionText.trim().toLowerCase());
      return new Set(normalized).size === normalized.length;
    },
    { message: 'Option text must not be duplicated', path: ['options'] },
  );
export type McqQuestionFieldsInput = z.infer<typeof McqQuestionFieldsSchema>;

export const CreateMcqQuestionSchema = McqQuestionFieldsSchema;
export type CreateMcqQuestionInput = z.infer<typeof CreateMcqQuestionSchema>;

// Partial + no cross-field refine, matching UpdateCodingQuestionSchema's precedent — the
// admin form resends the complete current state on every save (see AdminMcqFormPage), so
// partial-only updates from other callers aren't a real scenario this needs to validate
// mid-flight; the invariant is still enforced defensively at approval and publish time
// (QuestionsService.review / AssessmentsService.publish) since this schema alone can't
// guarantee it once options is optional.
export const UpdateMcqQuestionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  mcqType: z.enum(MCQ_TYPES).optional(),
  questionText: z.string().trim().min(1).max(5000).optional(),
  codeSnippet: z.string().trim().max(20000).nullable().optional(),
  explanation: z.string().trim().max(5000).nullable().optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  topics: z.array(z.enum(MCQ_TOPICS)).min(1).max(5).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  marks: z.number().positive().max(1000).optional(),
  negativeMarkingValue: z.number().min(0).max(1000).optional(),
  options: z.array(McqOptionInputSchema).min(2).max(8).optional(),
});
export type UpdateMcqQuestionInput = z.infer<typeof UpdateMcqQuestionSchema>;

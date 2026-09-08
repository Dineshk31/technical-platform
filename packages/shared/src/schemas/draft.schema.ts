import { z } from 'zod';
import { PROGRAMMING_LANGUAGES } from '../enums/question.enum.js';

export const SaveCodeDraftSchema = z.object({
  language: z.enum(PROGRAMMING_LANGUAGES),
  code: z.string().max(100_000),
});
export type SaveCodeDraftInput = z.infer<typeof SaveCodeDraftSchema>;

// Phase 11 — student MCQ answer persistence. An empty array clears the answer
// (reverts the question to NOT_ATTEMPTED); a non-empty array is the student's full
// current selection, replacing any prior one — the server computes correctness from
// this, never trusts a client-supplied verdict (docs/assessment-system.md §4/§9).
export const SaveMcqAnswerSchema = z.object({
  optionIds: z.array(z.string().uuid()).max(10),
});
export type SaveMcqAnswerInput = z.infer<typeof SaveMcqAnswerSchema>;

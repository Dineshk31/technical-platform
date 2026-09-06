import { z } from 'zod';
import { PROGRAMMING_LANGUAGES } from '../enums/question.enum.js';

export const SaveCodeDraftSchema = z.object({
  language: z.enum(PROGRAMMING_LANGUAGES),
  code: z.string().max(100_000),
});
export type SaveCodeDraftInput = z.infer<typeof SaveCodeDraftSchema>;

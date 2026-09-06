import { z } from 'zod';
import { PROGRAMMING_LANGUAGES } from '../enums/question.enum.js';

// Same size ceiling as SaveCodeDraftSchema (docs/coding-engine.md doesn't call out a
// different limit for Run vs. draft-save, and keeping them identical means a draft
// that was saved successfully can never be rejected only at Run time on size grounds).
export const RunCodeSchema = z.object({
  language: z.enum(PROGRAMMING_LANGUAGES),
  code: z.string().min(1, 'Source code is required').max(100_000),
});
export type RunCodeInput = z.infer<typeof RunCodeSchema>;

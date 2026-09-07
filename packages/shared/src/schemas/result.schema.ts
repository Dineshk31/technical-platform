import { z } from 'zod';
import { ATTEMPT_STATUS_CODES } from '../enums/assessment.enum.js';

// Phase 8 — GET /assessments/:id/results (admin roster). `NOT_STARTED` is not a
// real `attempts.status` value (a participant with no attempt row at all) — it's
// a synthetic filter value the admin roster understands, kept out of
// ATTEMPT_STATUS_CODES so that shared enum stays a true mirror of the DB enum.
export const ListResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum([...ATTEMPT_STATUS_CODES, 'NOT_STARTED']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListResultsQueryInput = z.infer<typeof ListResultsQuerySchema>;

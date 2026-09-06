import { z } from 'zod';
import { ASSESSMENT_STATUS_CODES } from '../enums/assessment.enum.js';

export const CreateAssessmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    instructions: z.string().trim().max(5000).optional(),
    durationMinutes: z.number().int().min(1).max(600),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
  })
  .refine((data) => data.endAt > data.startAt, { message: 'endAt must be after startAt', path: ['endAt'] });
export type CreateAssessmentInput = z.infer<typeof CreateAssessmentSchema>;

export const UpdateAssessmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    instructions: z.string().trim().max(5000).nullable().optional(),
    durationMinutes: z.number().int().min(1).max(600).optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
  })
  .refine((data) => !data.startAt || !data.endAt || data.endAt > data.startAt, {
    message: 'endAt must be after startAt',
    path: ['endAt'],
  });
export type UpdateAssessmentInput = z.infer<typeof UpdateAssessmentSchema>;

export const ListAssessmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ASSESSMENT_STATUS_CODES).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListAssessmentsQueryInput = z.infer<typeof ListAssessmentsQuerySchema>;

export const ListAssignedAssessmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAssignedAssessmentsQueryInput = z.infer<typeof ListAssignedAssessmentsQuerySchema>;

export const CreateSectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  // MCQ sections are enabled once the MCQ question bank exists (Phase 11).
  sectionType: z.literal('CODING'),
  orderIndex: z.number().int().min(0).optional(),
});
export type CreateSectionInput = z.infer<typeof CreateSectionSchema>;

export const UpdateSectionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  orderIndex: z.number().int().min(0).optional(),
});
export type UpdateSectionInput = z.infer<typeof UpdateSectionSchema>;

export const AttachQuestionSchema = z.object({
  questionId: z.string().uuid(),
  marksOverride: z.number().positive().max(1000).optional(),
  orderIndex: z.number().int().min(0).optional(),
});
export type AttachQuestionInput = z.infer<typeof AttachQuestionSchema>;

export const UpdateAssessmentQuestionSchema = z.object({
  marksOverride: z.number().positive().max(1000).nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
});
export type UpdateAssessmentQuestionInput = z.infer<typeof UpdateAssessmentQuestionSchema>;

export const AssignParticipantsSchema = z
  .object({
    userIds: z.array(z.string().uuid()).min(1).max(500).optional(),
    department: z.string().trim().min(1).max(200).optional(),
    batch: z.string().trim().min(1).max(100).optional(),
  })
  .refine((data) => (data.userIds && data.userIds.length > 0) || data.department || data.batch, {
    message: 'Provide userIds, or a department/batch filter',
  });
export type AssignParticipantsInput = z.infer<typeof AssignParticipantsSchema>;

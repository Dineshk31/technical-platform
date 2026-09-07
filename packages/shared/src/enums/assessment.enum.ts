export const ASSESSMENT_STATUS_CODES = ['DRAFT', 'PUBLISHED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type AssessmentStatusCode = (typeof ASSESSMENT_STATUS_CODES)[number];

export const ATTEMPT_STATUS_CODES = ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'] as const;
export type AttemptStatusCode = (typeof ATTEMPT_STATUS_CODES)[number];

// Only CODING is creatable in Phase 2 — MCQ sections arrive once Phase 11 builds
// the MCQ question bank (there would be nothing to attach to one yet).
export const SECTION_TYPE_CODES = ['CODING', 'MCQ'] as const;
export type SectionTypeCode = (typeof SECTION_TYPE_CODES)[number];

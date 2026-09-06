import type {
  Assessment,
  AssessmentQuestion,
  AssessmentSection,
  CodingQuestion,
  CodingQuestionLanguage,
  CodingReferenceSolution,
  CodingStarterTemplate,
  CodingTestCase,
  Question,
  QuestionReview,
  User,
} from '../../../../generated/prisma/index.js';

export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number((value as { toString(): string }).toString());
}

type ReviewWithReviewer = QuestionReview & { reviewedBy: Pick<User, 'id' | 'name'> | null };

type AttachedAssessmentLink = AssessmentQuestion & {
  section: AssessmentSection & { assessment: Pick<Assessment, 'id' | 'title' | 'status'> };
};

export type AdminQuestionDetailSource = Question & {
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  codingQuestion:
    | (CodingQuestion & {
        languages: CodingQuestionLanguage[];
        testCases: CodingTestCase[];
        referenceSolutions: CodingReferenceSolution[];
        starterTemplates: CodingStarterTemplate[];
      })
    | null;
  reviews: ReviewWithReviewer[];
  assessmentQuestions: AttachedAssessmentLink[];
};

/**
 * The one admin detail shape — includes hidden test cases and reference
 * solutions because every route that reaches this mapper is ADMIN-only
 * (see docs/security.md §2). There is no student-facing mapper in this
 * module: Phase 3 adds no student route into the question bank at all.
 */
export function toAdminQuestionDetail(q: AdminQuestionDetailSource) {
  const cq = q.codingQuestion;
  const testCases = cq?.testCases ?? [];

  return {
    id: q.id,
    type: q.type,
    title: q.title,
    difficulty: q.difficulty,
    topics: q.topics,
    tags: q.tags,
    marks: toNum(q.marks),
    source: q.source,
    approvalStatus: q.approvalStatus,
    problemStatement: cq?.problemStatement ?? '',
    inputFormat: cq?.inputFormat ?? '',
    outputFormat: cq?.outputFormat ?? '',
    constraints: cq?.constraints ?? [],
    examples: (cq?.examples as unknown) ?? [],
    timeLimitSeconds: toNum(cq?.timeLimitSeconds),
    memoryLimitMb: cq?.memoryLimitMb ?? 0,
    supportedLanguages: (cq?.languages ?? []).map((l) => l.language),
    publicTestCases: testCases
      .filter((tc) => !tc.isHidden)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(toTestCaseDto),
    hiddenTestCases: testCases
      .filter((tc) => tc.isHidden)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(toTestCaseDto),
    referenceSolutions: (cq?.referenceSolutions ?? []).map((rs) => ({ language: rs.language, code: rs.code })),
    starterTemplates: (cq?.starterTemplates ?? []).map((st) => ({ language: st.language, code: st.code })),
    createdBy: q.createdBy,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    reviews: q.reviews
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        status: r.status,
        notes: r.reviewNotes,
        reviewedBy: r.reviewedBy,
        createdAt: r.createdAt,
      })),
    attachedToAssessments: dedupeAssessments(q.assessmentQuestions),
  };
}

function toTestCaseDto(tc: CodingTestCase) {
  return { id: tc.id, input: tc.input, expectedOutput: tc.expectedOutput, orderIndex: tc.orderIndex };
}

function dedupeAssessments(links: AttachedAssessmentLink[]) {
  const byId = new Map<string, { id: string; title: string; status: string }>();
  for (const link of links) {
    byId.set(link.section.assessment.id, link.section.assessment);
  }
  return [...byId.values()];
}

export type AdminQuestionListSource = Question & {
  codingQuestion: {
    languages: CodingQuestionLanguage[];
    testCases: Pick<CodingTestCase, 'isHidden'>[];
  } | null;
  createdBy: Pick<User, 'id' | 'name'>;
};

export function toAdminQuestionListItem(q: AdminQuestionListSource) {
  const testCases = q.codingQuestion?.testCases ?? [];
  return {
    id: q.id,
    title: q.title,
    difficulty: q.difficulty,
    topics: q.topics,
    tags: q.tags,
    marks: toNum(q.marks),
    approvalStatus: q.approvalStatus,
    source: q.source,
    supportedLanguages: (q.codingQuestion?.languages ?? []).map((l) => l.language),
    publicTestCaseCount: testCases.filter((tc) => !tc.isHidden).length,
    hiddenTestCaseCount: testCases.filter((tc) => tc.isHidden).length,
    createdBy: q.createdBy,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

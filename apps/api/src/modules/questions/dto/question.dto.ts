import type {
  AiGenerationRequest,
  Assessment,
  AssessmentQuestion,
  AssessmentSection,
  CodingQuestion,
  CodingQuestionLanguage,
  CodingReferenceSolution,
  CodingStarterTemplate,
  CodingTestCase,
  McqOption,
  McqQuestion,
  Question,
  QuestionReview,
  Submission,
  SubmissionTestResult,
  User,
} from '../../../../generated/prisma/index.js';
import { questionVerificationStatus, solutionVerificationStatus } from '../verification.util.js';

export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number((value as { toString(): string }).toString());
}

type ReviewWithReviewer = QuestionReview & { reviewedBy: Pick<User, 'id' | 'name'> | null };

type AttachedAssessmentLink = AssessmentQuestion & {
  section: AssessmentSection & { assessment: Pick<Assessment, 'id' | 'title' | 'status'> };
};

type GenerationRequestWithRequester = Pick<
  AiGenerationRequest,
  'id' | 'topic' | 'difficulty' | 'countRequested' | 'status' | 'createdAt'
> & { requestedBy: Pick<User, 'id' | 'name'> };

type McqQuestionWithOptions = McqQuestion & { options: McqOption[] };

type VerificationTestResult = SubmissionTestResult & {
  testCase: Pick<CodingTestCase, 'input' | 'expectedOutput' | 'orderIndex' | 'isHidden'>;
};
type ReferenceSolutionWithVerification = CodingReferenceSolution & {
  verificationSubmission: (Submission & { testResults: VerificationTestResult[] }) | null;
};

const MAX_SHOWN = 2000;
const clip = (text: string | null) => (text !== null && text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text);

export type AdminQuestionDetailSource = Question & {
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  codingQuestion:
    | (CodingQuestion & {
        languages: CodingQuestionLanguage[];
        testCases: CodingTestCase[];
        referenceSolutions: ReferenceSolutionWithVerification[];
        starterTemplates: CodingStarterTemplate[];
      })
    | null;
  mcqQuestion: McqQuestionWithOptions | null;
  reviews: ReviewWithReviewer[];
  assessmentQuestions: AttachedAssessmentLink[];
  aiGenerationRequest: GenerationRequestWithRequester | null;
};

/**
 * The one admin detail shape — includes hidden test cases, reference solutions, and
 * (for MCQ) `isCorrect` on every option, because every route that reaches this mapper
 * is ADMIN-only (see docs/security.md §2). The shared/common fields are identical
 * regardless of `type`; the type-specific fields are only present for that type —
 * there is no student-facing mapper in this module (see AssessmentsService.getStudentQuestions
 * for the restricted, type-aware DTO used during an active attempt instead).
 */
export function toAdminQuestionDetail(q: AdminQuestionDetailSource) {
  const common = {
    id: q.id,
    type: q.type,
    title: q.title,
    difficulty: q.difficulty,
    topics: q.topics,
    tags: q.tags,
    marks: toNum(q.marks),
    source: q.source,
    approvalStatus: q.approvalStatus,
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
    aiGenerationRequest: q.aiGenerationRequest
      ? {
          id: q.aiGenerationRequest.id,
          topic: q.aiGenerationRequest.topic,
          difficulty: q.aiGenerationRequest.difficulty,
          countRequested: q.aiGenerationRequest.countRequested,
          status: q.aiGenerationRequest.status,
          createdAt: q.aiGenerationRequest.createdAt,
          requestedBy: q.aiGenerationRequest.requestedBy,
        }
      : null,
  };

  if (q.type === 'MCQ') {
    const mq = q.mcqQuestion;
    return {
      ...common,
      mcqType: mq?.mcqType ?? 'SINGLE_CHOICE',
      questionText: mq?.questionText ?? '',
      codeSnippet: mq?.codeSnippet ?? null,
      explanation: mq?.explanation ?? null,
      negativeMarkingValue: toNum(mq?.negativeMarkingValue),
      options: (mq?.options ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((o) => ({ id: o.id, optionText: o.optionText, isCorrect: o.isCorrect, orderIndex: o.orderIndex })),
    };
  }

  const cq = q.codingQuestion;
  const testCases = cq?.testCases ?? [];
  return {
    ...common,
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
    verification: toVerificationDto(cq?.referenceSolutions ?? []),
    starterTemplates: (cq?.starterTemplates ?? []).map((st) => ({ language: st.language, code: st.code })),
  };
}

/**
 * Phase 18 — per-language verification result. Admin-only like the rest of this DTO,
 * so a failing hidden test's input/expected/actual output is shown in full: that is
 * exactly what an admin needs to tell a wrong test from a wrong reference solution.
 */
function toVerificationDto(solutions: ReferenceSolutionWithVerification[]) {
  const perSolution = solutions.map((rs) => {
    const run = rs.verificationSubmission;
    const status = solutionVerificationStatus(run);
    return {
      language: rs.language,
      status,
      verdict: run?.status ?? null,
      testsPassed: run?.testsPassed ?? 0,
      testsTotal: run?.testsTotal ?? 0,
      completedAt: run?.completedAt ?? null,
      errorMessage: clip(run?.errorMessage ?? null),
      failures: (run?.testResults ?? [])
        .filter((r) => !r.passed)
        .sort((a, b) => Number(a.isHidden) - Number(b.isHidden) || a.testCase.orderIndex - b.testCase.orderIndex)
        .map((r) => ({
          testCaseId: r.testCaseId,
          isHidden: r.isHidden,
          orderIndex: r.testCase.orderIndex,
          status: r.status,
          input: clip(r.testCase.input),
          expectedOutput: clip(r.testCase.expectedOutput),
          actualOutput: clip(r.actualOutput),
          errorMessage: clip(r.errorMessage),
        })),
    };
  });
  return { status: questionVerificationStatus(perSolution.map((s) => s.status)), solutions: perSolution };
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
    referenceSolutions: { verificationSubmission: Pick<Submission, 'status'> | null }[];
  } | null;
  mcqQuestion: {
    mcqType: McqQuestion['mcqType'];
    options: Pick<McqOption, 'id'>[];
  } | null;
  createdBy: Pick<User, 'id' | 'name'>;
};

export function toAdminQuestionListItem(q: AdminQuestionListSource) {
  const testCases = q.codingQuestion?.testCases ?? [];
  return {
    id: q.id,
    type: q.type,
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
    // Phase 18 — null for MCQs, which have nothing to execute.
    verificationStatus: q.codingQuestion
      ? questionVerificationStatus(q.codingQuestion.referenceSolutions.map((rs) => solutionVerificationStatus(rs.verificationSubmission)))
      : null,
    mcqType: q.mcqQuestion?.mcqType ?? null,
    optionCount: q.mcqQuestion?.options.length ?? null,
    createdBy: q.createdBy,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

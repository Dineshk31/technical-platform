import { toNum } from '../../assessments/dto/assessment.dto.js';

type TestResultWithCase = {
  testCaseId: string;
  isHidden: boolean;
  status: string;
  passed: boolean;
  actualOutput: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  errorMessage: string | null;
  orderIndex: number;
  testCase: { input: string; expectedOutput: string };
};

type SubmissionWithResults = {
  id: string;
  questionId: string;
  kind: string;
  language: string;
  status: string;
  score: unknown;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  testResults: TestResultWithCase[];
};

/**
 * The one serialization boundary for a Submission. Hidden test cases never
 * appear here at all for Phase 6 (RUN only ever loads public test cases —
 * see execution-service's loadTestCases), but this mapping still applies the
 * isHidden -> withhold-input/output/actualOutput rule defensively, so a
 * future SUBMIT path that reuses this same GET endpoint can never leak a
 * hidden test case's content through this DTO by omission
 * (docs/coding-engine.md §5, docs/architecture.md §5.3).
 */
export function toSubmissionDetail(submission: SubmissionWithResults) {
  return {
    id: submission.id,
    questionId: submission.questionId,
    kind: submission.kind,
    language: submission.language,
    status: submission.status,
    score: toNum(submission.score),
    testsPassed: submission.testsPassed,
    testsTotal: submission.testsTotal,
    runtimeMs: submission.runtimeMs,
    memoryKb: submission.memoryKb,
    errorMessage: submission.errorMessage,
    createdAt: submission.createdAt,
    completedAt: submission.completedAt,
    testCases: submission.testResults
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((tr) => ({
        status: tr.status,
        passed: tr.passed,
        input: tr.isHidden ? undefined : tr.testCase.input,
        expectedOutput: tr.isHidden ? undefined : tr.testCase.expectedOutput,
        actualOutput: tr.isHidden ? undefined : (tr.actualOutput ?? undefined),
        runtimeMs: tr.runtimeMs,
        memoryKb: tr.memoryKb,
        errorMessage: tr.errorMessage ?? undefined,
        isHidden: tr.isHidden,
      })),
  };
}

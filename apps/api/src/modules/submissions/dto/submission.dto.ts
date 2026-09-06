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
 * isHidden -> withhold-input/output/actualOutput rule defensively, so the
 * Phase 7 SUBMIT path that reuses this same GET endpoint can never leak a
 * hidden test case's content through this DTO by omission
 * (docs/coding-engine.md §5, docs/architecture.md §5.3).
 *
 * `marks` is the question's marks *in this assessment* (0 for RUN, since Run
 * is never graded) — see SubmissionsService.getEffectiveMarks for why this is
 * computed by the API rather than read off `submission.score` (which
 * execution-service always writes as 0, since it has no DB access to
 * `questions.marks`). MVP scoring is all-or-nothing (docs/database-schema.md
 * §5 — `coding_test_cases.weight` is reserved but unused): full marks only on
 * a SUBMIT that reaches ACCEPTED (every test, public and hidden, passed).
 */
export function toSubmissionDetail(submission: SubmissionWithResults, marks: number) {
  return {
    id: submission.id,
    questionId: submission.questionId,
    kind: submission.kind,
    language: submission.language,
    status: submission.status,
    score: submission.kind === 'SUBMIT' && submission.status === 'ACCEPTED' ? marks : 0,
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

type SubmissionSummarySource = {
  id: string;
  kind: string;
  language: string;
  status: string;
  testsPassed: number;
  testsTotal: number;
  createdAt: Date;
  completedAt: Date | null;
};

/**
 * GET /attempts/:attemptId/questions/:questionId/submissions — Phase 7
 * submission history. Deliberately a much narrower shape than
 * toSubmissionDetail: no testCases at all, so there is nothing here for a
 * future field-add to accidentally leak — same "structurally absent, not
 * just omitted" pattern as the hidden-test-case fields above
 * (docs/security.md §2).
 */
export function toSubmissionSummary(submission: SubmissionSummarySource, marks: number) {
  return {
    id: submission.id,
    kind: submission.kind,
    language: submission.language,
    status: submission.status,
    score: submission.kind === 'SUBMIT' && submission.status === 'ACCEPTED' ? marks : 0,
    testsPassed: submission.testsPassed,
    testsTotal: submission.testsTotal,
    createdAt: submission.createdAt,
    completedAt: submission.completedAt,
  };
}

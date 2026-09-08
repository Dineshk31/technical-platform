import type { ProgrammingLanguageCode } from '@technical-platform/shared';
import { apiFetch } from './api-client';

export interface AttemptStatusDto {
  attemptId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';
  startedAt: string;
  endsAt: string;
  submittedAt: string | null;
  serverNow: string;
}

interface StudentQuestionCommon {
  id: string;
  questionId: string;
  title: string;
  difficulty: string;
  marks: number;
  orderIndex: number;
  status: 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';
}

export interface StudentCodingQuestionDto extends StudentQuestionCommon {
  type: 'CODING';
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: { input: string; output: string; explanation?: string }[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  supportedLanguages: string[];
  publicTestCases: { id: string; input: string; expectedOutput: string }[];
  /** Question-specific only — no entry means "use the generic fallback for this language". */
  starterCode: Partial<Record<ProgrammingLanguageCode, string>>;
}

export interface StudentMcqQuestionDto extends StudentQuestionCommon {
  type: 'MCQ';
  mcqType: string;
  questionText: string;
  codeSnippet: string | null;
  topics: string[];
  // No isCorrect anywhere on this type — the field is structurally absent from the
  // student-facing API response, not merely unused (docs/security.md §2).
  options: { id: string; optionText: string }[];
  /** The student's own current selection for this attempt — never correctness. */
  selectedOptionIds: string[];
}

export type StudentQuestionDto = StudentCodingQuestionDto | StudentMcqQuestionDto;

export interface StudentSectionDto {
  id: string;
  title: string;
  sectionType: string;
  orderIndex: number;
  questions: StudentQuestionDto[];
}

export interface StudentQuestionsResponse {
  attemptId: string;
  assessmentTitle: string;
  sections: StudentSectionDto[];
}

export interface AttemptDetailDto {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  status: string;
  startedAt: string;
  endsAt: string;
  submittedAt: string | null;
}

export function getAttemptDetail(attemptId: string) {
  return apiFetch<AttemptDetailDto>(`/attempts/${attemptId}`);
}

export function getAttemptStatus(assessmentId: string) {
  return apiFetch<AttemptStatusDto>(`/assessments/${assessmentId}/status`);
}

export function getStudentQuestions(assessmentId: string) {
  return apiFetch<StudentQuestionsResponse>(`/assessments/${assessmentId}/questions`);
}

export function submitAttempt(assessmentId: string) {
  return apiFetch<{ id: string; status: string; submittedAt: string }>(`/assessments/${assessmentId}/submit`, {
    method: 'POST',
  });
}

export interface CodeDraftDto {
  questionId: string;
  language: ProgrammingLanguageCode;
  code: string;
  updatedAt: string;
}

export function getAttemptDrafts(attemptId: string) {
  return apiFetch<CodeDraftDto[]>(`/attempts/${attemptId}/drafts`);
}

export function saveAttemptDraft(attemptId: string, questionId: string, language: ProgrammingLanguageCode, code: string) {
  return apiFetch<{ questionId: string; language: string; updatedAt: string }>(
    `/attempts/${attemptId}/questions/${questionId}/draft`,
    { method: 'PUT', body: JSON.stringify({ language, code }) },
  );
}

// ---- Phase 11: MCQ answers ----
// Evaluated immediately server-side (docs/assessment-system.md §4) — the response never
// carries isCorrect/score, only an ack of what was saved (docs/security.md, Part 3/14).
export function saveMcqAnswer(assessmentId: string, questionId: string, optionIds: string[]) {
  return apiFetch<{ questionId: string; selectedOptionIds: string[] }>(
    `/assessments/${assessmentId}/mcq/${questionId}/answer`,
    { method: 'POST', body: JSON.stringify({ optionIds }) },
  );
}

// ---- Phase 6: Run Code (public test cases only — see docs/coding-engine.md) ----

export type SubmissionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'COMPILATION_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface TestCaseResultDto {
  status: SubmissionStatus;
  passed: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  runtimeMs: number | null;
  memoryKb: number | null;
  errorMessage?: string;
  isHidden: boolean;
}

export interface SubmissionDetailDto {
  id: string;
  questionId: string;
  kind: 'RUN' | 'SUBMIT';
  language: ProgrammingLanguageCode;
  status: SubmissionStatus;
  score: number;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  testCases: TestCaseResultDto[];
}

export function runCode(attemptId: string, questionId: string, language: ProgrammingLanguageCode, code: string) {
  return apiFetch<{ submissionId: string; status: SubmissionStatus; testsTotal: number }>(
    `/attempts/${attemptId}/questions/${questionId}/run`,
    { method: 'POST', body: JSON.stringify({ language, code }) },
  );
}

// ---- Phase 7: Submit Solution (public + hidden test cases, graded) ----

export function submitCode(attemptId: string, questionId: string, language: ProgrammingLanguageCode, code: string) {
  return apiFetch<{ submissionId: string; status: SubmissionStatus; testsTotal: number }>(
    `/attempts/${attemptId}/questions/${questionId}/submit`,
    { method: 'POST', body: JSON.stringify({ language, code }) },
  );
}

export interface SubmissionHistoryItemDto {
  id: string;
  kind: 'RUN' | 'SUBMIT';
  language: ProgrammingLanguageCode;
  status: SubmissionStatus;
  score: number;
  testsPassed: number;
  testsTotal: number;
  createdAt: string;
  completedAt: string | null;
}

export function getSubmissionHistory(attemptId: string, questionId: string) {
  return apiFetch<SubmissionHistoryItemDto[]>(`/attempts/${attemptId}/questions/${questionId}/submissions`);
}

export function getSubmission(submissionId: string) {
  return apiFetch<SubmissionDetailDto>(`/submissions/${submissionId}`);
}

const TERMINAL_STATUSES: SubmissionStatus[] = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'COMPILATION_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
];

/** Polls GET /submissions/:id until it leaves PENDING/RUNNING (docs/coding-engine.md
 * §3 — Run/Submit are async; the API returns immediately and the frontend polls
 * for the result rather than the API blocking the HTTP request on execution). */
export async function pollSubmission(
  submissionId: string,
  options: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SubmissionDetailDto> {
  const intervalMs = options.intervalMs ?? 700;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await getSubmission(submissionId);
    if (TERMINAL_STATUSES.includes(result.status)) return result;
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the result. Please try running again.');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

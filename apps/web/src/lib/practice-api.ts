import type { ProgrammingLanguageCode } from '@technical-platform/shared';
import { apiFetch } from './api-client';
import type { SubmissionHistoryItemDto, SubmissionStatus } from './attempts-api';

export type PracticeQuestionStatus = 'SOLVED' | 'ATTEMPTED' | 'NOT_ATTEMPTED';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PracticeQuestionListItem {
  id: string;
  title: string;
  difficulty: string;
  topics: string[];
  marks: number;
  supportedLanguages: string[];
  status: PracticeQuestionStatus;
}

export type PracticeSortOption = 'newest' | 'easiest' | 'hardest' | 'recommended';

export interface ListPracticeQuestionsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  difficulty?: string;
  topic?: string;
  language?: string;
  status?: PracticeQuestionStatus | 'UNSOLVED';
  sort?: PracticeSortOption;
}

function toQueryString(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function listPracticeQuestions(params: ListPracticeQuestionsParams = {}) {
  return apiFetch<PaginatedResult<PracticeQuestionListItem>>(`/practice/questions${toQueryString(params)}`);
}

export interface PracticeActivityItem {
  questionId: string;
  title: string;
  difficulty: string;
  kind: 'RUN' | 'SUBMIT';
  status: SubmissionStatus;
  createdAt: string;
}

export interface PracticeContinueQuestion {
  questionId: string;
  title: string;
  difficulty: string;
  language: ProgrammingLanguageCode;
  lastActivityAt: string;
}

export interface PracticeProgressDto {
  totalProblems: number;
  solved: number;
  attempted: number;
  byDifficulty: { difficulty: string; total: number; solved: number; attempted: number }[];
  byTopic: { topic: string; total: number; solved: number; attempted: number }[];
  recentActivity: PracticeActivityItem[];
  continueQuestion: PracticeContinueQuestion | null;
}

export function getPracticeProgress() {
  return apiFetch<PracticeProgressDto>('/practice/progress');
}

export interface PracticeDraftDto {
  language: ProgrammingLanguageCode;
  code: string;
  updatedAt: string;
}

export interface PracticeQuestionDetail {
  id: string;
  title: string;
  difficulty: string;
  topics: string[];
  marks: number;
  status: PracticeQuestionStatus;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: { input: string; output: string; explanation?: string }[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  supportedLanguages: string[];
  publicTestCases: { id: string; input: string; expectedOutput: string }[];
  starterCode: Partial<Record<ProgrammingLanguageCode, string>>;
  drafts: PracticeDraftDto[];
}

export function getPracticeQuestion(id: string) {
  return apiFetch<PracticeQuestionDetail>(`/practice/questions/${id}`);
}

export function savePracticeDraft(questionId: string, language: ProgrammingLanguageCode, code: string) {
  return apiFetch<{ questionId: string; language: string; updatedAt: string }>(`/practice/questions/${questionId}/draft`, {
    method: 'PUT',
    body: JSON.stringify({ language, code }),
  });
}

export function runPracticeCode(questionId: string, language: ProgrammingLanguageCode, code: string) {
  return apiFetch<{ submissionId: string; status: SubmissionStatus; testsTotal: number }>(
    `/practice/questions/${questionId}/run`,
    { method: 'POST', body: JSON.stringify({ language, code }) },
  );
}

export function submitPracticeCode(questionId: string, language: ProgrammingLanguageCode, code: string) {
  return apiFetch<{ submissionId: string; status: SubmissionStatus; testsTotal: number }>(
    `/practice/questions/${questionId}/submit`,
    { method: 'POST', body: JSON.stringify({ language, code }) },
  );
}

export function getPracticeSubmissionHistory(questionId: string, params: { page?: number; pageSize?: number } = {}) {
  return apiFetch<PaginatedResult<SubmissionHistoryItemDto>>(
    `/practice/questions/${questionId}/submissions${toQueryString(params)}`,
  );
}

// Run/Submit results and polling reuse attempts-api's getSubmission/pollSubmission
// directly — GET /submissions/:id already serves practice-owned submissions
// exactly like attempt-owned ones (see SubmissionsService.getSubmission), so
// there is nothing practice-specific to add here.

/**
 * The "what should I solve next" rule for the post-solve completion moment —
 * a real, explainable waterfall over this student's own state, never an invented
 * recommendation: prefer an unsolved problem sharing the just-solved problem's
 * primary topic (relevance), ordered easiest-first among unsolved (the existing
 * 'recommended' sort, already shipped in the Explorer), excluding the problem
 * just solved. Falls back to the same ordering with no topic constraint when
 * nothing else matches that topic.
 */
export async function getNextRecommendedProblem(
  excludeId: string,
  primaryTopic?: string,
): Promise<PracticeQuestionListItem | null> {
  if (primaryTopic) {
    const withTopic = await listPracticeQuestions({
      status: 'UNSOLVED',
      sort: 'recommended',
      topic: primaryTopic,
      pageSize: 5,
    });
    const match = withTopic.data.find((q) => q.id !== excludeId);
    if (match) return match;
  }
  const general = await listPracticeQuestions({ status: 'UNSOLVED', sort: 'recommended', pageSize: 5 });
  return general.data.find((q) => q.id !== excludeId) ?? null;
}

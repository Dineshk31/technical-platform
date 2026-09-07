import type {
  CreateCodingQuestionInput,
  CreateTestCaseInput,
  PaginatedResult,
  ReviewQuestionInput,
  UpdateCodingQuestionInput,
  UpdateTestCaseInput,
} from '@technical-platform/shared';
import { apiFetch } from './api-client';

export interface QuestionListItem {
  id: string;
  title: string;
  difficulty: string;
  topics: string[];
  tags: string[];
  marks: number;
  approvalStatus: string;
  source: string;
  supportedLanguages: string[];
  publicTestCaseCount: number;
  hiddenTestCaseCount: number;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseItem {
  id: string;
  input: string;
  expectedOutput: string;
  orderIndex: number;
}

export interface QuestionDetail {
  id: string;
  type: string;
  title: string;
  difficulty: string;
  topics: string[];
  tags: string[];
  marks: number;
  source: string;
  approvalStatus: string;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: { input: string; output: string; explanation?: string }[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  supportedLanguages: string[];
  publicTestCases: TestCaseItem[];
  hiddenTestCases: TestCaseItem[];
  referenceSolutions: { language: string; code: string }[];
  starterTemplates: { language: string; code: string }[];
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  reviews: { id: string; status: string; notes: string | null; reviewedBy: { id: string; name: string } | null; createdAt: string }[];
  attachedToAssessments: { id: string; title: string; status: string }[];
}

export interface ListQuestionsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  difficulty?: string;
  topic?: string;
  approvalStatus?: string;
  language?: string;
  source?: string;
}

function toQueryString(params: ListQuestionsParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function listQuestions(params: ListQuestionsParams = {}) {
  return apiFetch<PaginatedResult<QuestionListItem>>(`/questions${toQueryString(params)}`);
}

export function getQuestion(id: string) {
  return apiFetch<QuestionDetail>(`/questions/${id}`);
}

export function createQuestion(input: CreateCodingQuestionInput) {
  return apiFetch<QuestionDetail>('/questions/coding', { method: 'POST', body: JSON.stringify(input) });
}

export function updateQuestion(id: string, input: UpdateCodingQuestionInput) {
  return apiFetch<QuestionDetail>(`/questions/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteQuestion(id: string) {
  return apiFetch<void>(`/questions/${id}`, { method: 'DELETE' });
}

export function reviewQuestion(id: string, input: ReviewQuestionInput) {
  return apiFetch<QuestionDetail>(`/questions/${id}/review`, { method: 'POST', body: JSON.stringify(input) });
}

export function addTestCase(questionId: string, input: CreateTestCaseInput) {
  return apiFetch<QuestionDetail>(`/questions/${questionId}/test-cases`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateTestCase(questionId: string, testCaseId: string, input: UpdateTestCaseInput) {
  return apiFetch<QuestionDetail>(`/questions/${questionId}/test-cases/${testCaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeTestCase(questionId: string, testCaseId: string) {
  return apiFetch<void>(`/questions/${questionId}/test-cases/${testCaseId}`, { method: 'DELETE' });
}

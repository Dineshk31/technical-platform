import type {
  CreateCodingQuestionInput,
  CreateMcqQuestionInput,
  CreateTestCaseInput,
  PaginatedResult,
  ReviewQuestionInput,
  UpdateCodingQuestionInput,
  UpdateMcqQuestionInput,
  UpdateTestCaseInput,
} from '@technical-platform/shared';
import { apiFetch } from './api-client';

interface QuestionListItemCommon {
  id: string;
  type: string;
  title: string;
  difficulty: string;
  topics: string[];
  tags: string[];
  marks: number;
  approvalStatus: string;
  source: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface QuestionListItem extends QuestionListItemCommon {
  supportedLanguages: string[];
  publicTestCaseCount: number;
  hiddenTestCaseCount: number;
  mcqType: string | null;
  optionCount: number | null;
}

export interface TestCaseItem {
  id: string;
  input: string;
  expectedOutput: string;
  orderIndex: number;
}

export interface McqOptionItem {
  id: string;
  optionText: string;
  isCorrect: boolean;
  orderIndex: number;
}

interface QuestionDetailCommon {
  id: string;
  title: string;
  difficulty: string;
  topics: string[];
  tags: string[];
  marks: number;
  source: string;
  approvalStatus: string;
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  reviews: { id: string; status: string; notes: string | null; reviewedBy: { id: string; name: string } | null; createdAt: string }[];
  attachedToAssessments: { id: string; title: string; status: string }[];
  aiGenerationRequest: {
    id: string;
    topic: string;
    difficulty: string;
    countRequested: number;
    status: string;
    createdAt: string;
    requestedBy: { id: string; name: string };
  } | null;
}

export interface CodingQuestionDetail extends QuestionDetailCommon {
  type: 'CODING';
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
}

export interface McqQuestionDetail extends QuestionDetailCommon {
  type: 'MCQ';
  mcqType: string;
  questionText: string;
  codeSnippet: string | null;
  explanation: string | null;
  negativeMarkingValue: number;
  options: McqOptionItem[];
}

export type QuestionDetail = CodingQuestionDetail | McqQuestionDetail;

export interface ListQuestionsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  difficulty?: string;
  topic?: string;
  approvalStatus?: string;
  language?: string;
  source?: string;
  type?: string;
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
  return apiFetch<CodingQuestionDetail>('/questions/coding', { method: 'POST', body: JSON.stringify(input) });
}

export function updateQuestion(id: string, input: UpdateCodingQuestionInput) {
  return apiFetch<CodingQuestionDetail>(`/questions/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function createMcqQuestion(input: CreateMcqQuestionInput) {
  return apiFetch<McqQuestionDetail>('/questions/mcq', { method: 'POST', body: JSON.stringify(input) });
}

export function updateMcqQuestion(id: string, input: UpdateMcqQuestionInput) {
  return apiFetch<McqQuestionDetail>(`/questions/mcq/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteQuestion(id: string) {
  return apiFetch<void>(`/questions/${id}`, { method: 'DELETE' });
}

export function reviewQuestion(id: string, input: ReviewQuestionInput) {
  return apiFetch<QuestionDetail>(`/questions/${id}/review`, { method: 'POST', body: JSON.stringify(input) });
}

export function addTestCase(questionId: string, input: CreateTestCaseInput) {
  return apiFetch<CodingQuestionDetail>(`/questions/${questionId}/test-cases`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateTestCase(questionId: string, testCaseId: string, input: UpdateTestCaseInput) {
  return apiFetch<CodingQuestionDetail>(`/questions/${questionId}/test-cases/${testCaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeTestCase(questionId: string, testCaseId: string) {
  return apiFetch<void>(`/questions/${questionId}/test-cases/${testCaseId}`, { method: 'DELETE' });
}

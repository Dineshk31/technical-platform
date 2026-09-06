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

export interface StudentQuestionDto {
  id: string;
  questionId: string;
  title: string;
  difficulty: string;
  marks: number;
  orderIndex: number;
  status: 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';
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

export interface StudentSectionDto {
  id: string;
  title: string;
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

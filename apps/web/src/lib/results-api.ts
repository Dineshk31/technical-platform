import type { SubmissionStatus } from './attempts-api';
import { apiFetch } from './api-client';

export type QuestionResultStatus = 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';

export interface QuestionResultDto {
  questionId: string;
  title: string;
  difficulty: string;
  maxMarks: number;
  marksObtained: number;
  status: QuestionResultStatus;
  verdict: SubmissionStatus | null;
  submissionCount: number;
}

export interface SectionResultDto {
  sectionId: string;
  title: string;
  maxMarks: number;
  marksObtained: number;
  totalQuestions: number;
  solvedQuestions: number;
  questions: QuestionResultDto[];
}

export interface OverallResultDto {
  assessmentId: string;
  assessmentTitle: string;
  attemptStatus: string;
  startedAt: string;
  submittedAt: string | null;
  endedAt: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  questionsSolved: number;
  questionsAttempted: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  finalizedAt: string | null;
  sections: SectionResultDto[];
}

/** GET /assessments/:id/result — the caller's own result. Rejected with a 409
 * (thrown as ApiError by apiFetch) while the assessment window is still open —
 * see docs decision in ResultsService.getStudentResult. */
export function getStudentResult(assessmentId: string) {
  return apiFetch<OverallResultDto>(`/assessments/${assessmentId}/result`);
}

export interface AdminResultListItemDto {
  userId: string;
  studentName: string;
  studentEmail: string;
  attemptId: string | null;
  attemptStatus: string;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  submittedAt: string | null;
}

export interface PaginatedResults<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function listAssessmentResults(assessmentId: string, params: { page?: number; pageSize?: number; status?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  return apiFetch<PaginatedResults<AdminResultListItemDto>>(`/assessments/${assessmentId}/results${query ? `?${query}` : ''}`);
}

export type AdminResultDetailDto =
  | ({ finalized: true } & OverallResultDto & { student: { id: string; name: string; email: string } })
  | {
      finalized: false;
      student: { id: string; name: string; email: string };
      attemptStatus: string;
      startedAt: string;
      endedAt: string;
    };

export function getAdminResultDetail(assessmentId: string, attemptId: string) {
  return apiFetch<AdminResultDetailDto>(`/assessments/${assessmentId}/results/${attemptId}`);
}

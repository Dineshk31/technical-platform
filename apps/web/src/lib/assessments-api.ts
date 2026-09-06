import type {
  AssignParticipantsInput,
  AttachQuestionInput,
  CreateAssessmentInput,
  CreateSectionInput,
  PaginatedResult,
  UpdateAssessmentInput,
  UpdateAssessmentQuestionInput,
  UpdateSectionInput,
} from '@technical-platform/shared';
import { apiFetch } from './api-client';

export interface AssessmentListItem {
  id: string;
  title: string;
  status: string;
  effectiveStatus: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  maxMarks: number;
  sectionsCount: number;
  participantsCount: number;
  createdAt: string;
}

export interface AssessmentQuestionItem {
  id: string;
  questionId: string;
  title: string;
  type: string;
  difficulty: string;
  marks: number;
  orderIndex: number;
}

export interface AssessmentSectionItem {
  id: string;
  title: string;
  sectionType: string;
  orderIndex: number;
  questions: AssessmentQuestionItem[];
}

export interface AssessmentParticipantItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  source: string;
  groupLabel: string | null;
  assignedAt: string;
  hasStarted: boolean;
}

export interface AdminAssessmentDetail {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  maxMarks: number;
  status: string;
  effectiveStatus: string;
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  sections: AssessmentSectionItem[];
  participants: AssessmentParticipantItem[];
  sectionsCount: number;
  questionsCount: number;
  participantsCount: number;
}

export interface StudentAssessmentDetail {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  maxMarks: number;
  status: string;
}

export interface StudentAssignedListItem {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  maxMarks: number;
  hasStarted: boolean;
  attemptId: string | null;
}

export interface AttemptDto {
  id: string;
  assessmentId: string;
  startedAt: string;
  endsAt: string;
  status: string;
}

// ---- Admin ----

export function listAssessments(params: { page?: number; status?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  return apiFetch<PaginatedResult<AssessmentListItem>>(`/assessments${query ? `?${query}` : ''}`);
}

export function createAssessment(input: CreateAssessmentInput) {
  return apiFetch<AdminAssessmentDetail>('/assessments', { method: 'POST', body: JSON.stringify(input) });
}

export function getAdminAssessment(id: string) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${id}`);
}

export function updateAssessment(id: string, input: UpdateAssessmentInput) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteAssessment(id: string) {
  return apiFetch<void>(`/assessments/${id}`, { method: 'DELETE' });
}

export function publishAssessment(id: string) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${id}/publish`, { method: 'POST' });
}

export function unpublishAssessment(id: string) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${id}/unpublish`, { method: 'POST' });
}

export function archiveAssessment(id: string) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${id}/archive`, { method: 'POST' });
}

export function addSection(assessmentId: string, input: CreateSectionInput) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${assessmentId}/sections`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSection(assessmentId: string, sectionId: string, input: UpdateSectionInput) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${assessmentId}/sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeSection(assessmentId: string, sectionId: string) {
  return apiFetch<void>(`/assessments/${assessmentId}/sections/${sectionId}`, { method: 'DELETE' });
}

export function attachQuestion(assessmentId: string, sectionId: string, input: AttachQuestionInput) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${assessmentId}/sections/${sectionId}/questions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAssessmentQuestion(
  assessmentId: string,
  sectionId: string,
  aqId: string,
  input: UpdateAssessmentQuestionInput,
) {
  return apiFetch<AdminAssessmentDetail>(`/assessments/${assessmentId}/sections/${sectionId}/questions/${aqId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function detachQuestion(assessmentId: string, sectionId: string, aqId: string) {
  return apiFetch<void>(`/assessments/${assessmentId}/sections/${sectionId}/questions/${aqId}`, { method: 'DELETE' });
}

export function assignParticipants(assessmentId: string, input: AssignParticipantsInput) {
  return apiFetch<{ added: number; alreadyAssigned: number; total: number }>(`/assessments/${assessmentId}/participants`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function unassignParticipant(assessmentId: string, userId: string) {
  return apiFetch<void>(`/assessments/${assessmentId}/participants/${userId}`, { method: 'DELETE' });
}

// ---- Student ----

export function listAssignedAssessments(params: { page?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  const query = qs.toString();
  return apiFetch<PaginatedResult<StudentAssignedListItem>>(`/assessments/assigned${query ? `?${query}` : ''}`);
}

export function getStudentAssessment(id: string) {
  return apiFetch<StudentAssessmentDetail>(`/assessments/${id}`);
}

export function startAssessment(id: string) {
  return apiFetch<AttemptDto>(`/assessments/${id}/start`, { method: 'POST' });
}

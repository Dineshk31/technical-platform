import type { Topic } from '@technical-platform/shared';
import { apiFetch } from './api-client';
import type { PaginatedResult } from './practice-api';

export interface AdminLessonListItem {
  id: string;
  topic: string;
  title: string;
  summary: string;
  orderIndex: number;
  isPublished: boolean;
  checkCount: number;
  practiceCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A question attached to a lesson, with its current state so the editor can flag a
 * link that has gone stale (e.g. a practice problem whose verification was reset). */
export interface LessonLinkedQuestion {
  questionId: string;
  title: string;
  type: string;
  difficulty: string;
  topics: string[];
  approvalStatus: string;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'PASSED' | 'FAILED' | null;
}

export interface AdminLessonDetail extends Omit<AdminLessonListItem, 'checkCount' | 'practiceCount'> {
  objectives: string[];
  concept: string;
  example: string | null;
  commonMistakes: string | null;
  checks: LessonLinkedQuestion[];
  practice: LessonLinkedQuestion[];
}

export interface ListLessonsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  topic?: string;
  isPublished?: boolean;
}

export interface LessonInput {
  topic: Topic;
  title: string;
  summary: string;
  concept: string;
  example?: string;
  commonMistakes?: string;
  orderIndex?: number;
  isPublished?: boolean;
  objectives?: string[];
  checkQuestionIds?: string[];
  practiceQuestionIds?: string[];
}

function toQueryString(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// ---- Admin ----

export function listLessons(params: ListLessonsParams = {}) {
  return apiFetch<PaginatedResult<AdminLessonListItem>>(`/lessons${toQueryString(params)}`);
}

export function getAdminLesson(id: string) {
  return apiFetch<AdminLessonDetail>(`/lessons/${id}`);
}

export function createLesson(input: LessonInput) {
  return apiFetch<AdminLessonDetail>('/lessons', { method: 'POST', body: JSON.stringify(input) });
}

export function updateLesson(id: string, input: Partial<LessonInput>) {
  return apiFetch<AdminLessonDetail>(`/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteLesson(id: string) {
  return apiFetch<void>(`/lessons/${id}`, { method: 'DELETE' });
}

// ---- Student ----

export interface StudentLessonListItem {
  id: string;
  topic: string;
  title: string;
  summary: string;
  orderIndex: number;
  objectivesCount: number;
  checksTotal: number;
  checksPassed: number;
  completed: boolean;
}

/** A knowledge check as the student sees it: options carry no correctness, and the
 * explanation only arrives with their own graded answer. */
export interface StudentLessonCheck {
  questionId: string;
  mcqType: string;
  multiple: boolean;
  questionText: string;
  codeSnippet: string | null;
  options: { id: string; optionText: string }[];
  answer: { selectedOptionIds: string[]; isCorrect: boolean; attemptCount: number; explanation: string | null } | null;
}

export interface StudentLessonPractice {
  questionId: string;
  title: string;
  difficulty: string;
  status: 'SOLVED' | 'ATTEMPTED' | 'NOT_ATTEMPTED';
}

export interface StudentLessonDetail {
  id: string;
  topic: string;
  title: string;
  summary: string;
  objectives: string[];
  concept: string;
  example: string | null;
  commonMistakes: string | null;
  completed: boolean;
  checks: StudentLessonCheck[];
  checksTotal: number;
  checksPassed: number;
  practice: StudentLessonPractice[];
}

export interface LearnTopicProgress {
  topic: string;
  total: number;
  completed: number;
  /** Phase 18 — the first lesson in this topic the student hasn't completed yet. */
  nextLessonId: string | null;
  nextLessonTitle: string | null;
}

export interface LearnContinueLesson {
  lessonId: string;
  title: string;
  topic: string;
  lastActivityAt: string;
}

export interface LearnProgressDto {
  totalLessons: number;
  completedLessons: number;
  byTopic: LearnTopicProgress[];
  continueLesson: LearnContinueLesson | null;
}

export function getLearnProgress() {
  return apiFetch<LearnProgressDto>('/learn/progress');
}

export function listTopicLessons(topic: string) {
  return apiFetch<StudentLessonListItem[]>(`/learn/topics/${encodeURIComponent(topic)}/lessons`);
}

export function getStudentLesson(id: string) {
  return apiFetch<StudentLessonDetail>(`/learn/lessons/${id}`);
}

export interface LessonCheckAnswerResult {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  attemptCount: number;
  explanation: string | null;
  checksTotal: number;
  checksPassed: number;
  lessonCompleted: boolean;
}

/** Phase 18 — graded on the server; never returns which options were correct. */
export function answerLessonCheck(lessonId: string, questionId: string, optionIds: string[]) {
  return apiFetch<LessonCheckAnswerResult>(`/learn/lessons/${lessonId}/checks/${questionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ optionIds }),
  });
}

export function completeLesson(id: string) {
  return apiFetch<{ lessonId: string; completed: boolean }>(`/learn/lessons/${id}/complete`, { method: 'POST' });
}

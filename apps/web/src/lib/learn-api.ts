import type { CodingTopic } from '@technical-platform/shared';
import { apiFetch } from './api-client';
import type { PaginatedResult } from './practice-api';

export interface AdminLessonListItem {
  id: string;
  topic: string;
  title: string;
  summary: string;
  orderIndex: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLessonDetail extends AdminLessonListItem {
  concept: string;
  example: string | null;
  commonMistakes: string | null;
}

export interface ListLessonsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  topic?: string;
  isPublished?: boolean;
}

export interface LessonInput {
  topic: CodingTopic;
  title: string;
  summary: string;
  concept: string;
  example?: string;
  commonMistakes?: string;
  orderIndex?: number;
  isPublished?: boolean;
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
  completed: boolean;
}

export interface StudentLessonDetail {
  id: string;
  topic: string;
  title: string;
  summary: string;
  concept: string;
  example: string | null;
  commonMistakes: string | null;
  completed: boolean;
}

export interface LearnTopicProgress {
  topic: string;
  total: number;
  completed: number;
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

export function completeLesson(id: string) {
  return apiFetch<{ lessonId: string; completed: boolean }>(`/learn/lessons/${id}/complete`, { method: 'POST' });
}

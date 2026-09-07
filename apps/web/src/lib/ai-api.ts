import type {
  AIGeneratedCodingQuestion,
  CreateCodingQuestionInput,
  FailedGenerationItem,
  GenerateCodingQuestionsInput,
} from '@technical-platform/shared';
import { apiFetch } from './api-client';

export interface GenerationPreview {
  requestId: string;
  status: string;
  topic: string;
  difficulty: string;
  language: string | null;
  countRequested: number;
  generated: AIGeneratedCodingQuestion[];
  failed: FailedGenerationItem[];
  errorMessage: string | null;
  createdAt: string;
}

export function generateQuestions(input: GenerateCodingQuestionsInput) {
  return apiFetch<GenerationPreview>('/ai/questions/generate', { method: 'POST', body: JSON.stringify(input) });
}

export function getGenerationRequest(requestId: string) {
  return apiFetch<GenerationPreview>(`/ai/questions/requests/${requestId}`);
}

export function saveGeneratedQuestions(requestId: string, questions: CreateCodingQuestionInput[]) {
  return apiFetch<{ requestId: string; created: string[] }>(`/ai/questions/requests/${requestId}/save`, {
    method: 'POST',
    body: JSON.stringify({ questions }),
  });
}

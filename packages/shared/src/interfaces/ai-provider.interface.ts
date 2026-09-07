import type { CodingTopic, DifficultyLevel, ProgrammingLanguageCode } from '../enums/question.enum.js';

/**
 * Provider-agnostic generation request. Deliberately narrower than the full
 * admin-facing DTO (schemas/ai.schema.ts `GenerateCodingQuestionsInput`) —
 * it carries only what any coding-question generator needs, so a future
 * OpenAI/Claude provider never has to know about API-layer concerns.
 */
export interface AICodingGenerationRequest {
  topic: CodingTopic;
  difficulty: DifficultyLevel;
  language: ProgrammingLanguageCode;
  count: number;
  concepts?: string[];
  additionalInstructions?: string;
  marks?: number;
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
}

export interface AIProviderError {
  code: string;
  message: string;
}

export interface AIProviderResult<T> {
  success: boolean;
  data?: T;
  /** Exact prompt text sent to the provider — stored in `ai_generation_requests.prompt_snapshot` for audit, regardless of outcome (docs/ai-integration.md §4). */
  promptSnapshot: string;
  /** Raw provider response text, for audit only — never surfaced to students, never trusted as validated data. */
  rawResponseText?: string;
  error?: AIProviderError;
}

/**
 * The only surface the application core depends on for AI-backed question
 * generation (docs/ai-integration.md §2). `QuestionGenerationService` is bound
 * to this interface via Nest DI (the `AI_PROVIDER` token in apps/api), never to
 * a concrete provider class — swapping Gemini for another vendor later means
 * writing a new class that implements `AIProvider` and changing one binding,
 * not touching the generation service, validation flow, or any controller.
 *
 * Returns raw, untrusted candidate objects (`unknown[]`) rather than a typed
 * draft array on purpose: a provider's output is external input regardless of
 * source, so it must pass through `QuestionGenerationService`'s Zod validation
 * before anything downstream treats it as a real generated question.
 */
export interface AIProvider {
  generateCodingQuestions(request: AICodingGenerationRequest): Promise<AIProviderResult<unknown[]>>;
}

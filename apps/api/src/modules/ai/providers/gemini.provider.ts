import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI, Type, type Schema } from '@google/genai';
import {
  CODING_TOPICS,
  DIFFICULTY_LEVELS,
  PROGRAMMING_LANGUAGES,
  type AICodingGenerationRequest,
  type AIProvider,
  type AIProviderResult,
} from '@technical-platform/shared';

// A full coding-question batch (examples, public+hidden test cases, reference
// solutions, starter templates) is a large structured-output payload — measured
// ~35s for a real single-question generation against the live API, so a shorter
// timeout just wasted retries on requests that were still succeeding, only slowly.
const TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries, per docs/ai-integration.md §3
const RETRY_BASE_DELAY_MS = 500;
// Raw response text is stored for audit only (never trusted, never shown to students);
// capped so a runaway/looping generation can't bloat ai_generation_requests.raw_response.
const MAX_STORED_RESPONSE_CHARS = 20_000;

/**
 * The ONLY module in this codebase that imports `@google/genai` or knows
 * anything about Gemini's request/response shape (docs/ai-integration.md §2).
 * `QuestionGenerationService` depends solely on the `AIProvider` interface —
 * this class's entire job is: build the prompt, call Gemini with structured
 * output, retry/timeout it sensibly, and hand back either raw untrusted
 * candidate objects or a sanitized error. It never validates business rules
 * (topic list, test case counts, etc.) — that is `QuestionGenerationService`'s
 * job, on data it must treat as external input regardless of source.
 */
@Injectable()
export class GeminiProvider implements AIProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-3.6-flash';
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async generateCodingQuestions(request: AICodingGenerationRequest): Promise<AIProviderResult<unknown[]>> {
    const promptSnapshot = buildPrompt(request);

    if (!this.client) {
      return {
        success: false,
        promptSnapshot,
        error: { code: 'AI_PROVIDER_NOT_CONFIGURED', message: 'Gemini API key is not configured on the server' },
      };
    }

    const client = this.client;
    const startedAt = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await client.models.generateContent({
          model: this.model,
          contents: promptSnapshot,
          config: {
            responseMimeType: 'application/json',
            responseSchema: buildResponseSchema(),
            abortSignal: controller.signal,
          },
        });

        const text = response.text ?? '';
        this.logger.log(`Gemini generation succeeded in ${Date.now() - startedAt}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);

        const parsed = parseCandidateArray(text);
        if (!parsed.ok) {
          return { success: false, promptSnapshot, rawResponseText: text.slice(0, MAX_STORED_RESPONSE_CHARS), error: parsed.error };
        }
        return { success: true, data: parsed.data, promptSnapshot, rawResponseText: text.slice(0, MAX_STORED_RESPONSE_CHARS) };
      } catch (error) {
        lastError = error;
        const classification = classifyError(error);
        this.logger.warn(
          `Gemini generation attempt ${attempt}/${MAX_ATTEMPTS} failed: ${classification.code} — ${classification.message}`,
        );
        if (!classification.retryable || attempt === MAX_ATTEMPTS) {
          return { success: false, promptSnapshot, error: classification };
        }
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    // Unreachable given the loop above always returns or continues, but keeps the
    // function's return type honest without a non-null assertion.
    const classification = classifyError(lastError);
    return { success: false, promptSnapshot, error: classification };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return { code: 'AI_RATE_LIMITED', message: 'AI service is rate-limited, try again shortly', retryable: true };
    }
    if (error.status >= 500) {
      return { code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI service is temporarily unavailable', retryable: true };
    }
    if (error.status === 401 || error.status === 403) {
      return { code: 'AI_INVALID_API_KEY', message: 'The configured Gemini API key was rejected', retryable: false };
    }
    return { code: 'AI_PROVIDER_ERROR', message: 'AI service rejected the request', retryable: false };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'AI_TIMEOUT', message: 'AI service did not respond in time', retryable: true };
  }
  return { code: 'AI_PROVIDER_ERROR', message: 'Failed to reach the AI service', retryable: true };
}

function parseCandidateArray(text: string): { ok: true; data: unknown[] } | { ok: false; error: { code: string; message: string } } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'AI_RESPONSE_MALFORMED', message: 'AI service returned a response that was not valid JSON' } };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: { code: 'AI_RESPONSE_MALFORMED', message: 'AI service returned JSON that was not an array of questions' } };
  }
  return { ok: true, data: value };
}

/**
 * Single prompt template (docs/ai-integration.md §4), parameterized by
 * topic/difficulty/language/count/hints. The exact text this produces is
 * stored verbatim in `ai_generation_requests.prompt_snapshot`.
 */
function buildPrompt(request: AICodingGenerationRequest): string {
  const marks = request.marks ?? 10;
  const timeLimitSeconds = request.timeLimitSeconds ?? 2;
  const memoryLimitMb = request.memoryLimitMb ?? 256;

  const lines = [
    `You are setting coding exam questions for a university technical assessment platform.`,
    `Generate exactly ${request.count} original, competitive-programming-caliber coding question(s) with the following parameters:`,
    `- Topic: ${request.topic}`,
    `- Difficulty: ${request.difficulty}`,
    `- Target language: ${request.language}`,
    `- Marks per question: ${marks}`,
    `- Time limit: ${timeLimitSeconds} seconds`,
    `- Memory limit: ${memoryLimitMb} MB`,
  ];
  if (request.concepts?.length) {
    lines.push(`- Concepts to specifically test: ${request.concepts.join(', ')}`);
  }
  if (request.additionalInstructions) {
    lines.push(`- Additional instructions from the admin: ${request.additionalInstructions}`);
  }
  lines.push(
    '',
    'Requirements for every question:',
    '- Do NOT produce trivial questions (e.g. "what is an array", "print hello world"). Each question must require real problem-solving.',
    '- "topics" must be a non-empty subset of this fixed list, and must include the requested topic: ' + CODING_TOPICS.join(', '),
    '- "difficulty" must be exactly one of: ' + DIFFICULTY_LEVELS.join(', '),
    '- "supportedLanguages" must be a subset of: ' + PROGRAMMING_LANGUAGES.join(', ') + `, and must include "${request.language}".`,
    '- Provide at least 2 worked examples with clear explanations.',
    '- Constraints must be tight enough that a brute-force solution and an optimal solution are meaningfully distinguishable where relevant.',
    '- Provide at least 2 public test cases and at least 2 hidden test cases, all with exact expected output matching the stated output format.',
    `- Provide a correct, working reference solution in ${request.language} (and optionally other supported languages) under "referenceSolutions", keyed by language code.`,
    '- "starterTemplates" is optional boilerplate shown to students before they write anything; leave it as an empty object if you do not want to provide one.',
    '- "solutionApproach" should briefly explain, in prose, the intended algorithmic approach (for the reviewing admin only — this is never shown to students).',
    '- Return ONLY the JSON array matching the supplied schema. No prose, no markdown code fences, no commentary before or after the JSON.',
  );
  return lines.join('\n');
}

const LANGUAGE_CODE_PROPERTIES: Record<string, Schema> = Object.fromEntries(
  PROGRAMMING_LANGUAGES.map((lang) => [lang, { type: Type.STRING }]),
);

const TEST_CASE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: { input: { type: Type.STRING }, expectedOutput: { type: Type.STRING } },
  required: ['input', 'expectedOutput'],
};

/**
 * JSON schema handed to Gemini's structured-output config. Field names are
 * identical to `AIGeneratedCodingQuestionSchema` (packages/shared) on purpose —
 * this is the only place that shape is described for Gemini, so there is
 * nothing to keep in sync by hand beyond matching the two once.
 */
function buildResponseSchema(): Schema {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        problemStatement: { type: Type.STRING },
        inputFormat: { type: Type.STRING },
        outputFormat: { type: Type.STRING },
        constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
        examples: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { input: { type: Type.STRING }, output: { type: Type.STRING }, explanation: { type: Type.STRING } },
            required: ['input', 'output'],
          },
        },
        difficulty: { type: Type.STRING, enum: [...DIFFICULTY_LEVELS] },
        topics: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...CODING_TOPICS] } },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        marks: { type: Type.NUMBER },
        timeLimitSeconds: { type: Type.NUMBER },
        memoryLimitMb: { type: Type.INTEGER },
        supportedLanguages: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...PROGRAMMING_LANGUAGES] } },
        referenceSolutions: { type: Type.OBJECT, properties: LANGUAGE_CODE_PROPERTIES },
        starterTemplates: { type: Type.OBJECT, properties: LANGUAGE_CODE_PROPERTIES },
        publicTestCases: { type: Type.ARRAY, items: TEST_CASE_SCHEMA },
        hiddenTestCases: { type: Type.ARRAY, items: TEST_CASE_SCHEMA },
        solutionApproach: { type: Type.STRING },
      },
      required: [
        'title',
        'problemStatement',
        'inputFormat',
        'outputFormat',
        'examples',
        'difficulty',
        'topics',
        'marks',
        'timeLimitSeconds',
        'memoryLimitMb',
        'supportedLanguages',
        'referenceSolutions',
        'publicTestCases',
        'hiddenTestCases',
      ],
    },
  };
}

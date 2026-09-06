# AI Integration — Gemini Question Generation

## 1. Principle: AI generates content, never judges correctness, never runs unmediated

Gemini is used for exactly one thing: producing draft coding (and later MCQ) questions for admin review. It is never used to run student code, check test cases, score submissions, or touch authentication/authorization. This is enforced architecturally, not just by convention — the `AIProvider` interface only exposes question-generation methods; there is no method by which any other module could route student code through it even if someone tried.

## 2. Provider abstraction

```ts
// packages/shared/src/interfaces/ai-provider.ts
interface AIProvider {
  generateCodingQuestions(request: CodingGenerationRequest): Promise<AIProviderResult<CodingQuestionDraft[]>>;
}

interface AIProviderResult<T> {
  success: boolean;
  data?: T;
  rawResponse?: unknown;   // stored for audit in ai_generation_requests.raw_response
  error?: { code: string; message: string };
}
```

```
QuestionGenerationService   (apps/api/src/modules/ai)
        │  depends on the AIProvider interface only
        ▼
AIProvider  (interface, packages/shared)
        ▲  implemented by
        │
GeminiProvider  (apps/api/src/modules/ai/providers/gemini.provider.ts)
        │  uses @google/generative-ai
        ▼
   Gemini API
```

`QuestionGenerationService` is bound to `AIProvider` via Nest's DI token (`AI_PROVIDER`), not to `GeminiProvider` directly. Replacing Gemini with the university's own AI system later means writing a new class implementing `AIProvider` and changing one line in the module's provider registration — no changes to `QuestionGenerationService`, the review workflow, or any controller.

**No Gemini API calls exist outside `GeminiProvider`.** This is a hard rule for the codebase, not just a diagram — enforced by keeping `@google/generative-ai` as a dependency of only the `ai` module (not imported anywhere else) and code review.

## 3. Request flow

```
Admin: generate 5 MEDIUM Dynamic Programming coding questions
        │
        ▼
POST /ai/questions/generate
        │
        ▼
QuestionGenerationService.generate(request)
    1. Validate request shape (Zod) — topic from the fixed topic list, difficulty enum, count 1–10
    2. Build a deterministic prompt from a template (see §4), injecting topic/difficulty/count/language/marks/limits
    3. Call AIProvider.generateCodingQuestions(request)
        → GeminiProvider:
            - calls Gemini with responseMimeType: "application/json" and an explicit JSON schema
              (Gemini structured output mode — the model is constrained to the schema at generation time,
              which is the first validation layer)
            - wraps the call with: timeout (20s), retry (up to 2 retries, exponential backoff on 429/5xx only,
              never on 4xx client errors), and structured logging of latency/outcome
    4. Re-validate every returned item against CodingQuestionDraftSchema (Zod) — the second, authoritative
       validation layer; Gemini's own schema constraint is a best-effort optimization, not trusted alone
    5. For each item that PASSES validation:
         insert questions + coding_questions + coding_test_cases + coding_reference_solutions
         with approval_status = PENDING_REVIEW, source = AI_GENERATED
       For each item that FAILS validation:
         do not insert; record the failure in ai_generation_requests (partial success is allowed —
         e.g. 4 of 5 requested questions inserted, 1 failed validation, surfaced to the admin)
    6. Write ai_generation_requests row: status, prompt_snapshot, raw_response, counts
        │
        ▼
Response: { requestId, created: [questionId, ...], failed: 1 }
```

## 4. Prompt construction

A single template function (`buildCodingQuestionPrompt`) in `GeminiProvider`, parameterized by topic/difficulty/count/language/marks/timeLimit/memoryLimit, instructs the model to:
- produce competitive-programming-caliber problems (explicitly bans trivial "what is an array"-style questions, mirroring the spec's requirement),
- return **only** the JSON array matching the schema (no prose, no markdown fences — reinforced by Gemini's structured-output mode which returns raw JSON regardless of the instruction, giving defense in depth),
- include working example input/output pairs and constraints tight enough to make brute-force vs. optimal solutions distinguishable where relevant (useful signal for difficulty calibration, doesn't have to be perfect since a human reviews every question).

The exact prompt text sent is stored in `ai_generation_requests.prompt_snapshot` for every request — this is both a debugging aid and a way to answer "why did it generate this" during review.

## 5. Structured output schema

```json
{
  "title": "string",
  "description": "string",
  "input_format": "string",
  "output_format": "string",
  "constraints": ["string"],
  "examples": [{ "input": "string", "output": "string", "explanation": "string" }],
  "difficulty": "EASY | MEDIUM | HARD",
  "topics": ["string"],
  "marks": "number",
  "time_limit": "number (seconds)",
  "memory_limit": "number (MB)",
  "supported_languages": ["cpp" | "java" | "python"],
  "public_test_cases": [{ "input": "string", "output": "string" }],
  "hidden_test_cases": [{ "input": "string", "output": "string" }],
  "reference_solution": { "cpp": "string?", "java": "string?", "python": "string?" }
}
```

This exact shape is both (a) the JSON schema handed to Gemini's structured-output config and (b) a Zod schema (`CodingQuestionDraftSchema`) in `packages/shared`, so there is one definition, not two that could drift. Validation rules beyond basic typing:
- `difficulty` must be one of the enum values (case-normalized before validation, since models are inconsistent about casing).
- `topics` must be non-empty and drawn from the platform's fixed topic list (§`question-system.md`); unrecognized topics are rejected rather than silently accepted, to keep filtering reliable.
- `public_test_cases` and `hidden_test_cases` must each have ≥1 entry.
- `reference_solution` must have at least one non-empty entry matching a language in `supported_languages`.
- `marks`/`time_limit`/`memory_limit` must be positive numbers within sane bounds (e.g. time_limit ≤ 10s, memory_limit ≤ 1024MB) to prevent a malformed generation from creating an unrunnable question.

**Malformed output never becomes a database row.** A generated item failing any of the above is dropped from the insert batch and reported as a failure in the response — it never reaches `PENDING_REVIEW`, let alone `APPROVED`.

## 6. Minimizing free-tier API usage

- Generation is **admin-initiated only**, batched (up to 10 questions per call, one API call per batch — not one call per question).
- **No caching layer is needed for correctness** (every generation is meant to produce fresh content), but **duplicate-request guarding** is applied: if an identical `(topic, difficulty, count, language, marks, timeLimit, memoryLimit)` request was made by the same admin within the last 60 seconds, the API returns the prior `ai_generation_requests` result instead of calling Gemini again (protects against accidental double-submit from the UI, not a general cache).
- Regeneration (`POST /ai/questions/:id/regenerate`) replaces one question at a time rather than the whole batch, so rejecting one bad item out of five doesn't cost four wasted regenerations.
- No background/scheduled generation exists — Gemini is only called in direct response to an explicit admin action.
- Rate-limit (`429`) responses trigger the retry-with-backoff described in §3, capped at 2 retries, after which the request is marked `FAILED` with a clear "AI service is rate-limited, try again shortly" error rather than hammering the API.

## 7. Security

The Gemini API key lives only in the API server's environment (`GEMINI_API_KEY` in `.env`, never committed — see `.env.example`), read once at `GeminiProvider` construction. It is never sent to, logged by, or reachable from the frontend — there is no code path where a client request could cause the key to be echoed back (errors from `GeminiProvider` are caught and re-thrown as a generic `AI_GENERATION_FAILED` app error before reaching the controller layer). See `security.md` for key rotation/storage guidance.

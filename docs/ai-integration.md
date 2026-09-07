# AI Integration — Gemini Question Generation

## 1. Principle: AI generates content, never judges correctness, never runs unmediated

Gemini is used for exactly one thing: producing draft coding (and later MCQ) questions for admin review. It is never used to run student code, check test cases, score submissions, or touch authentication/authorization. This is enforced architecturally, not just by convention — the `AIProvider` interface only exposes question-generation methods; there is no method by which any other module could route student code through it even if someone tried.

## 2. Provider abstraction

```ts
// packages/shared/src/interfaces/ai-provider.interface.ts
interface AIProvider {
  generateCodingQuestions(request: AICodingGenerationRequest): Promise<AIProviderResult<unknown[]>>;
}

interface AIProviderResult<T> {
  success: boolean;
  data?: T;                // raw, untrusted candidates — QuestionGenerationService re-validates every item
  promptSnapshot: string;  // exact prompt text — stored in ai_generation_requests.prompt_snapshot regardless of outcome
  rawResponseText?: string; // stored for audit in ai_generation_requests.raw_response; never trusted, never shown to students
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
        │  uses @google/genai
        ▼
   Gemini API
```

`QuestionGenerationService` is bound to `AIProvider` via Nest's DI token (`AI_PROVIDER`), not to `GeminiProvider` directly. Replacing Gemini with the university's own AI system later means writing a new class implementing `AIProvider` and changing one line in the module's provider registration — no changes to `QuestionGenerationService`, the review workflow, or any controller.

**No Gemini API calls exist outside `GeminiProvider`.** This is a hard rule for the codebase, not just a diagram — enforced by keeping `@google/genai` as a dependency of only the `ai` module (not imported anywhere else) and code review.

**Implementation note (Phase 9):** the SDK actually used is `@google/genai` (Google's current, actively maintained unified SDK), not the `@google/generative-ai` package originally named above — that package is in maintenance mode. The abstraction boundary is identical either way; only `GeminiProvider`'s internals reference the SDK.

## 3. Request flow

**Preview-first, per Part 10 of the Phase 9 brief: nothing reaches `questions` until an explicit admin `save` call.** `generate` only ever writes an `ai_generation_requests` audit row.

```
Admin: generate 5 MEDIUM Dynamic Programming coding questions
        │
        ▼
POST /ai/questions/generate
        │
        ▼
QuestionGenerationService.generate(adminId, request)
    1. Validate request shape (Zod) — topic from the fixed topic list, difficulty enum, count 1–10
    2. Duplicate-request guard (§6) — identical request by the same admin within 60s returns
       the prior ai_generation_requests result instead of calling Gemini again
    3. Per-admin rate limit (§6) — only checked once past the dedupe guard, so a deduped
       request is never itself throttled
    4. Call AIProvider.generateCodingQuestions(request)
        → GeminiProvider builds the prompt (see §4), calls Gemini with
          responseMimeType: "application/json" and an explicit JSON schema (Gemini
          structured output mode — the model is constrained to the schema at generation
          time, which is the first validation layer), wraps the call with timeout (60s —
          a full batch's structured output, including test cases and reference solutions,
          measured ~35s for a single question against the live API, so a shorter timeout
          wasted retries on slow-but-succeeding calls),
          retry (up to 2 retries, exponential backoff on 429/5xx only, never on 4xx client
          errors), and structured logging of latency/outcome
    5. Re-validate every returned candidate against AIGeneratedCodingQuestionSchema (Zod) —
       the second, authoritative validation layer; Gemini's own schema constraint is a
       best-effort optimization, not trusted alone. Passing items become `drafts`; failing
       items become `failed: [{ index, issues }]` — nothing is discarded silently.
    6. Write one ai_generation_requests row: status (SUCCESS if ≥1 draft passed, else
       FAILED), prompt_snapshot, raw_response = { drafts, failed, rawText }
        │
        ▼
Response (preview, nothing persisted to `questions` yet):
  { requestId, generated: AIGeneratedCodingQuestion[], failed: [{ index, issues }] }
        │
        ▼  admin reviews, edits, deselects unwanted drafts in the UI
        ▼
POST /ai/questions/requests/:requestId/save   { questions: CreateCodingQuestionInput[] }
        │
        ▼
QuestionGenerationService.saveGenerated — for each selected draft, calls the SAME
QuestionsService.create() used for manual questions, with source = AI_GENERATED,
approval_status = PENDING_REVIEW, ai_generation_request_id = requestId
        │
        ▼
Response: { requestId, created: [questionId, ...] }
```

## 4. Prompt construction

A single template function (`buildPrompt`) in `GeminiProvider`, parameterized by topic/difficulty/count/language/concepts/additionalInstructions/marks/timeLimit/memoryLimit, instructs the model to:
- produce competitive-programming-caliber problems (explicitly bans trivial "what is an array"-style questions, mirroring the spec's requirement),
- return **only** the JSON array matching the schema (no prose, no markdown fences — reinforced by Gemini's structured-output mode which returns raw JSON regardless of the instruction, giving defense in depth),
- include working example input/output pairs and constraints tight enough to make brute-force vs. optimal solutions distinguishable where relevant (useful signal for difficulty calibration, doesn't have to be perfect since a human reviews every question).

The exact prompt text sent is stored in `ai_generation_requests.prompt_snapshot` for every request — this is both a debugging aid and a way to answer "why did it generate this" during review.

## 5. Structured output schema

```json
{
  "title": "string",
  "problemStatement": "string",
  "inputFormat": "string",
  "outputFormat": "string",
  "constraints": ["string"],
  "examples": [{ "input": "string", "output": "string", "explanation": "string?" }],
  "difficulty": "EASY | MEDIUM | HARD",
  "topics": ["string"],
  "tags": ["string"],
  "marks": "number",
  "timeLimitSeconds": "number",
  "memoryLimitMb": "number",
  "supportedLanguages": ["CPP" | "JAVA" | "PYTHON"],
  "publicTestCases": [{ "input": "string", "expectedOutput": "string" }],
  "hiddenTestCases": [{ "input": "string", "expectedOutput": "string" }],
  "referenceSolutions": { "CPP": "string?", "JAVA": "string?", "PYTHON": "string?" },
  "starterTemplates": { "CPP": "string?", "JAVA": "string?", "PYTHON": "string?" },
  "solutionApproach": "string?"
}
```

Field names are deliberately identical to the platform's own coding-question fields (camelCase, matching `CreateCodingQuestionInput`), not the `snake_case` sketch originally shown here — this is what makes "one definition, not two" literal: `AIGeneratedCodingQuestionSchema` (`packages/shared/src/schemas/ai.schema.ts`) directly extends the same `CodingQuestionFieldsSchema` used for manual question creation, adding only `solutionApproach` (a preview-only field, shown to the admin during review, with no column in `coding_questions` — dropped before a draft is saved). This exact shape is both (a) the JSON schema handed to Gemini's structured-output config and (b) that Zod schema. Validation rules beyond basic typing:
- `difficulty` must be one of the enum values.
- `topics` must be non-empty and drawn from the platform's fixed topic list (§`question-system.md`); unrecognized topics are rejected rather than silently accepted, to keep filtering reliable.
- `publicTestCases` and `hiddenTestCases` must each have ≥1 entry.
- `referenceSolutions` must have at least one non-empty entry matching a language in `supportedLanguages`.
- `marks`/`timeLimitSeconds`/`memoryLimitMb` must be positive numbers within sane bounds (e.g. time limit ≤ 10s, memory limit ≤ 1024MB) to prevent a malformed generation from creating an unrunnable question.

**Malformed output never becomes a database row.** A generated candidate failing any of the above is excluded from `generated` and reported in `failed: [{ index, issues }]` in the preview response instead — it never reaches even a `save` call, let alone `PENDING_REVIEW`.

## 6. Minimizing free-tier API usage

- Generation is **admin-initiated only**, batched (up to 10 questions per call, one API call per batch — not one call per question).
- **No caching layer is needed for correctness** (every generation is meant to produce fresh content), but **duplicate-request guarding** is applied: if an identical `(topic, difficulty, count, language)` request was made by the same admin within the last 60 seconds, the API returns the prior `ai_generation_requests` result instead of calling Gemini again (protects against accidental double-submit from the UI, not a general cache) — checked before the per-admin rate limit below, so a deduped call is never itself throttled.
- A separate per-admin rate limit (`AI_GENERATION_RATE_LIMIT_MS`, default 3s) additionally throttles calls that *do* reach the provider, independent of the dedupe window.
- "Regenerating" in the shipped UI is simply calling `generate` again with the same form values — since nothing is persisted until `save`, there is no separate "replace one saved question" endpoint to maintain; discarding a preview draft is a client-side action with no server round-trip.
- No background/scheduled generation exists — Gemini is only called in direct response to an explicit admin action.
- Rate-limit (`429`) responses trigger the retry-with-backoff described in §3, capped at 2 retries, after which the request is marked `FAILED` with a clear "AI service is rate-limited, try again shortly" error rather than hammering the API.

## 7. Security

The Gemini API key lives only in the API server's environment (`GEMINI_API_KEY` in `.env`, never committed — see `.env.example`), read once at `GeminiProvider` construction. It is **optional** at boot — an unset key does not fail application startup; `GeminiProvider` simply reports `AI_PROVIDER_NOT_CONFIGURED` (mapped to `502` by the controller layer) the first time generation is attempted, so a deployment without AI configured yet still runs everything else normally. The key is never sent to, logged by, or reachable from the frontend — there is no code path where a client request could cause it to be echoed back: every error `GeminiProvider` can produce is pre-classified into one of a small set of sanitized `{ code, message }` pairs (`AI_RATE_LIMITED`, `AI_PROVIDER_UNAVAILABLE`, `AI_INVALID_API_KEY`, `AI_TIMEOUT`, `AI_RESPONSE_MALFORMED`, `AI_PROVIDER_NOT_CONFIGURED`) before it ever leaves the provider — raw SDK error objects, stack traces, and the key itself never reach the controller or the response body. See `security.md` for key rotation/storage guidance.

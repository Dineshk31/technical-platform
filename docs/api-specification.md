# API Specification

## 1. Conventions

- Base path: `/api/v1` (versioned from day one — a future integration consumer should never be broken by an internal change).
- JSON in, JSON out. `Content-Type: application/json`.
- Auth: `Authorization: Bearer <JWT>`. Access token TTL 15 min, refresh token TTL 7 days (rotated on use, stored as an httpOnly cookie for the web app).
- Pagination: `?page=1&pageSize=20` (default 20, max 100), response envelope:
  ```json
  { "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 137, "totalPages": 7 } }
  ```
- Filtering: query params per resource, e.g. `GET /api/v1/questions?type=CODING&difficulty=MEDIUM&topic=Graphs&status=PENDING_REVIEW`.
- Errors: consistent shape across the whole API —
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "duration_minutes must be a positive integer",
      "details": [ { "field": "duration_minutes", "issue": "expected number, received string" } ]
    }
  }
  ```
- HTTP status codes: `200` OK, `201` Created, `204` No Content, `400` validation, `401` unauthenticated, `403` unauthorized (authenticated but wrong role/ownership), `404` not found, `409` conflict (e.g. double attempt-start), `422` semantically invalid (e.g. publishing an assessment with zero questions), `429` rate limited, `500`/`502` server/upstream error.
- All list/detail endpoints that could expose hidden coding data are served through explicit **response DTOs** (never `SELECT *` passthrough) so hidden test cases and reference solutions are structurally impossible to leak — see `security.md`.

## 2. Auth

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | public | email + password → access + refresh token |
| POST | `/auth/refresh` | public (valid refresh cookie) | rotate tokens |
| POST | `/auth/logout` | authenticated | revoke refresh token |
| GET | `/auth/me` | authenticated | current user profile + role |

Designed to be replaced/augmented by an SSO callback endpoint later (`POST /auth/sso/callback`) without touching any other module — see `integration.md`.

## 3. Users (admin-managed, minimal for MVP)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/users` | ADMIN | list/search students & admins, filter by role/department/batch |
| POST | `/users` | ADMIN | create a user (bulk import deferred to a later phase) |
| GET | `/users/:id` | ADMIN or self | profile |
| PATCH | `/users/:id` | ADMIN | update department/batch/active status |

## 4. Question Bank

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/questions` | ADMIN | list, filter by type/difficulty/topic/tag/approval_status/source |
| GET | `/questions/:id` | ADMIN | full detail **including** hidden test cases and reference solution |
| POST | `/questions/coding` | ADMIN | manually create a coding question (with test cases, reference solutions) |
| POST | `/questions/mcq` | ADMIN | manually create an MCQ question |
| PATCH | `/questions/:id` | ADMIN | edit any field, including AI-generated questions pre- or post-approval |
| DELETE | `/questions/:id` | ADMIN | delete (blocked with `409` if referenced by a non-DRAFT assessment) |
| POST | `/questions/:id/test-cases` | ADMIN | add a test case |
| PATCH | `/questions/:id/test-cases/:tcId` | ADMIN | edit a test case |
| DELETE | `/questions/:id/test-cases/:tcId` | ADMIN | remove a test case |
| POST | `/questions/:id/review` | ADMIN | `{ status: APPROVED\|REJECTED\|NEEDS_EDIT, notes? }` — writes `question_reviews`, updates `questions.approval_status` |

Student-facing question read is never a direct `/questions/:id` call — students only ever see questions in the context of an active attempt (`GET /assessments/:id/questions`, see below), which returns the restricted DTO.

## 5. AI Question Generation

**Implemented as a strict preview-before-save workflow** (built in Phase 9) — a
deliberate refinement of this section's original sketch, which described
`generate` inserting directly into `questions`. Nothing is ever written to
`questions`/`coding_questions` until the admin calls `save` explicitly with the
drafts they selected (edited or not); `generate` only writes an audit row to
`ai_generation_requests` (prompt, raw response, validated drafts, per-item
validation failures). See `ai-integration.md` §3/§8 for the full flow.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/ai/questions/generate` | ADMIN | body: `{ topic, difficulty, language, count, concepts?, additionalInstructions?, marks?, timeLimitSeconds?, memoryLimitMb? }`. Synchronously calls Gemini (small batch, admin-facing, acceptable latency), re-validates every candidate against the shared Zod schema (`AIGeneratedCodingQuestionSchema`), and returns a **preview**: `{ requestId, generated: [...], failed: [{ index, issues }] }`. No `questions` row is created by this call. |
| GET | `/ai/questions/requests/:id` | ADMIN | re-fetches a stored preview (the validated drafts + failures persisted on the `ai_generation_requests` row) — lets the admin reload the review page without re-calling Gemini. |
| POST | `/ai/questions/requests/:id/save` | ADMIN | body: `{ questions: CreateCodingQuestionInput[] }` — the admin's selected (and optionally edited) drafts. Each one is validated and inserted exactly as a manually created question would be (`QuestionsService.create`), with `source = AI_GENERATED`, `approval_status = PENDING_REVIEW`, and `ai_generation_request_id` set. Returns the created question IDs. This is the **only** endpoint that ever writes an AI-originated row into `questions`. |

Per-admin request throttling (`AI_GENERATION_RATE_LIMIT_MS`) and an identical-request
dedupe window (60s) both guard `generate`; a deduped request returns the prior
`ai_generation_requests` result without calling Gemini again and is therefore never
rate-limited itself — see `ai-integration.md` §6.

This is the **only** module allowed to call Gemini — see `ai-integration.md`.

## 6. Assessments (admin)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/assessments` | ADMIN | list, filter by status |
| POST | `/assessments` | ADMIN | create (starts as DRAFT) |
| GET | `/assessments/:id` | ADMIN | full detail incl. sections, questions, participants |
| PATCH | `/assessments/:id` | ADMIN | edit metadata/sections while DRAFT (locked fields once PUBLISHED — see `assessment-system.md`) |
| DELETE | `/assessments/:id` | ADMIN | delete (DRAFT only) |
| POST | `/assessments/:id/sections` | ADMIN | add a section |
| POST | `/assessments/:id/sections/:sectionId/questions` | ADMIN | attach a question bank item, with optional `marksOverride` |
| DELETE | `/assessments/:id/sections/:sectionId/questions/:aqId` | ADMIN | detach |
| POST | `/assessments/:id/participants` | ADMIN | assign students directly (`userIds: []`) or by group filter (`{ department, batch }`) |
| DELETE | `/assessments/:id/participants/:userId` | ADMIN | unassign (only before the student starts) |
| POST | `/assessments/:id/publish` | ADMIN | DRAFT → PUBLISHED, validates: ≥1 section, ≥1 question, ≥1 participant, valid time window |
| POST | `/assessments/:id/archive` | ADMIN | COMPLETED → ARCHIVED |

## 7. Assessment-taking (student)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/assessments/assigned` | STUDENT | assessments assigned to the current user, with attempt status |
| GET | `/assessments/:id` | STUDENT (participant only) | public metadata (title, instructions, duration, window, status) |
| POST | `/assessments/:id/start` | STUDENT (participant only) | creates (or resumes) the `attempts` row; server computes `ends_at`; `409` if already submitted; `422` if outside the assessment window |
| GET | `/assessments/:id/questions` | STUDENT (active attempt only) | sections + questions in the **restricted DTO**: problem statement, examples, public test cases, supported languages — **no** hidden test cases, **no** reference solution |
| GET | `/assessments/:id/status` | STUDENT | server-computed remaining time + attempt status (source of truth for the countdown timer) |
| POST | `/assessments/:id/mcq/:questionId/answer` | STUDENT (active attempt only) | submit/update an MCQ response |
| POST | `/assessments/:id/submit` | STUDENT (active attempt only) | finalize the attempt early (before time expires) |

## 8. Coding — run & submit

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/assessments/:id/questions/:questionId/run` | STUDENT (active attempt) | body `{ language, code }`. Executes against **public** test cases only. Creates a `submissions` row with `kind=RUN`, enqueues an `execution_jobs` row, returns the submission id immediately (`202 Accepted`) |
| POST | `/assessments/:id/questions/:questionId/submit` | STUDENT (active attempt) | same shape, `kind=SUBMIT`, executes against public + hidden test cases, computes score |
| GET | `/submissions/:id` | STUDENT (owner) or ADMIN | poll for result: status, tests_passed/total, runtime, memory, per-test breakdown (hidden test case `actual_output` withheld from students — only pass/fail shown) |
| GET | `/assessments/:id/questions/:questionId/submissions` | STUDENT (owner) or ADMIN | submission history for that question within the attempt |

Run/submit are async: the API writes the submission + job row and returns immediately; the frontend polls `GET /submissions/:id` (simple, avoids adding WebSockets for MVP — see `coding-engine.md`).

## 9. Results & Rankings

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/assessments/:id/result` | STUDENT (own) | own result once attempt is finalized |
| GET | `/assessments/:id/results` | ADMIN | all participants' results |
| GET | `/assessments/:id/ranking` | ADMIN, or STUDENT (own rank only, per `security.md`) | leaderboard: rank, student, score, percentage, solved count, time taken, submission count |

CSV/Excel export is a planned addition (`GET /assessments/:id/results.csv`) — deferred, but the results DTO is already shaped so it's a serialization change, not a data-model change.

## 10. Submissions (admin oversight)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/submissions` | ADMIN | all submissions, filterable by assessment/question/student/status |
| GET | `/submissions/:id/detail` | ADMIN | full detail including hidden-test-case breakdown, for grading disputes |

## 11. Example: publishing an assessment (validation flow)

```
POST /api/v1/assessments/:id/publish
```
Server checks (all enforced in `AssessmentsService`, not just the DB):
1. `status === DRAFT`
2. at least one section, each section has ≥1 question
3. `start_at < end_at`, `end_at` in the future
4. at least one participant assigned
5. every attached coding question has ≥1 public and ≥1 hidden test case

Failure → `422` with a `details[]` array naming every failed check (so the admin UI can show them all at once, not one at a time).

## 12. Not built in MVP but reserved

- `POST /debugging/...`, `POST /sql/...` — future modules, same pattern as `assessments`/`questions`.
- `GET /assessments/:id/results.xlsx` — export.
- `POST /auth/sso/callback` — external identity handoff.

# Question System

## 1. Question Bank as the single source of truth

Every question — manual or AI-generated — lives in the shared `questions` table (+ `coding_questions`/`mcq_questions` detail) and is only ever *referenced* by an assessment via `assessment_questions`. There is no concept of a question that belongs to one assessment; deleting an assessment never deletes its questions, and editing a question bank item after it's attached to a DRAFT assessment is expected (locked once the assessment is PUBLISHED — see `assessment-system.md`).

```
Question Bank
    ├── Coding Questions   (questions.type = CODING → coding_questions)
    └── Technical MCQs     (questions.type = MCQ → mcq_questions)
```

Filterable by difficulty, topics, tags, language (coding), source (MANUAL/AI_GENERATED), and approval_status.

## 2. Coding question model

Fields (see `database-schema.md` for exact columns): title, problem statement, input format, output format, constraints, examples (with explanations), difficulty, topics, marks, time limit, memory limit, supported languages, public test cases, hidden test cases, reference solution per language.

**Manual creation** (`POST /questions/coding`) is a single form-backed request validated against the shared Zod `CodingQuestionInputSchema` (same schema family used for AI output — see §4) with:
- at least 1 public and 1 hidden test case required before the question can reach `approval_status = APPROVED` (manual questions default to APPROVED immediately, since an admin authored them directly, but the same "≥1 public + ≥1 hidden" rule is enforced at *assessment publish time* regardless of source — see `assessment-system.md` §11).
- reference solution required for at least one supported language (used to sanity-check test cases before publishing — admins can run the reference solution against the test cases via the same `run` execution path used by students, from the admin UI).

**Hidden test cases are flagged at the row level** (`coding_test_cases.is_hidden`), not split into a separate table — this keeps ordering/weight consistent across public and hidden cases while making the leak-prevention rule a single boolean check enforced at the DTO layer (see `security.md`).

## 3. Topics & difficulty

Topics are a fixed, extensible list (stored as `TEXT[]` rather than a rigid enum so new topics don't require a migration): Arrays, Strings, Hashing, Sorting, Searching, Binary Search, Two Pointers, Sliding Window, Recursion, Backtracking, Linked Lists, Stacks, Queues, Trees, Binary Search Trees, Heaps, Graphs, Greedy Algorithms, Dynamic Programming, Bit Manipulation. The list is maintained in `packages/shared` as a constant used for both AI prompt construction and admin UI dropdowns, so both stay in sync automatically.

Difficulty is a strict enum (`EASY`/`MEDIUM`/`HARD`) since scoring/filtering logic depends on it being closed.

## 4. AI-generated question workflow

```
Admin selects: section=Coding, topic=Dynamic Programming, difficulty=MEDIUM, count=5
        │
        ▼
QuestionGenerationService → AIProvider (GeminiProvider)
        │  (structured JSON, validated against shared Zod schema)
        ▼
ai_generation_requests row (status, raw_response, prompt_snapshot)
        │  for each valid item:
        ▼
questions + coding_questions (+ test_cases + reference_solutions)
   approval_status = PENDING_REVIEW, source = AI_GENERATED
        │
        ▼
Admin Review UI  ──edit──▶ PATCH /questions/:id
                 ──regenerate──▶ POST /ai/questions/:id/regenerate
                 ──reject──▶ POST /questions/:id/review {status: REJECTED}
                 ──approve──▶ POST /questions/:id/review {status: APPROVED}
        │
        ▼
Question Bank (approval_status = APPROVED) ──▶ attachable to any assessment
```

**A generated question is never directly usable in an exam.** `assessment_questions` insertion (`POST /assessments/:id/sections/:sectionId/questions`) is rejected with `422` if the target question's `approval_status !== APPROVED`, regardless of source — this one check is what makes the "AI output can't become a live exam question" rule impossible to bypass, rather than relying on the admin UI to hide the option.

Every field of a generated question — including test cases and the reference solution — is editable through the same `PATCH /questions/:id` endpoint used for manual questions; there is no separate "AI question" edit form, which keeps the codebase from forking question-editing logic by source.

Malformed Gemini output (fails Zod validation) never reaches the `questions` table at all: `ai_generation_requests.status` is set to `FAILED` with `error_message`, and nothing is inserted. See `ai-integration.md` for validation details.

## 5. Technical MCQ model

Types: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `CODE_OUTPUT` (a code snippet + "what does this print" options), `SCENARIO` (a short scenario description + options) — modeled as one `mcq_type` enum rather than separate tables, since all four share the same options/correctness/explanation shape; only rendering differs (driven by `code_snippet` being present or not, and `mcq_type` for single vs. multi-select input control on the frontend).

Topics: DSA, Programming, OOP, DBMS, Operating Systems, Computer Networks, Computer Architecture, Software Engineering — a separate fixed list from coding topics (MCQs cover CS fundamentals broadly, not just DSA).

Scoring: `marks` on correct, `-negative_marking_value` on incorrect (configurable per question, default 0 = no negative marking), 0 for unanswered. `MULTIPLE_CHOICE` correctness in MVP is all-or-nothing (every correct option selected, no incorrect ones) — partial credit for partially-correct multi-select is a future refinement, same "reserved but not built" pattern as coding partial scoring.

MCQ questions go through the **same** question bank, review workflow, and reuse model as coding questions (`questions` table with `type = MCQ`). The MVP build order (`implementation-plan.md`) implements the coding engine first per the spec's priority, then wires MCQ into assessments — the data model for both is designed together now so that sequencing doesn't require a schema rework later.

## 6. Question reuse & versioning

Editing a question that's already attached to a PUBLISHED or later assessment is blocked (`409`) to prevent silently changing a live exam's content; it can still be edited freely while every assessment referencing it is DRAFT. Full version history (e.g. "question changed between run A and run B of an assessment") is not built for MVP — `updated_at` plus the `question_reviews` audit log is enough traceability for now; a `question_versions` table is a clean future addition if that becomes a real need.

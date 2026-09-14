# Phase 16 — The Learn Pillar: Architecture Audit

*Read-only audit. No application code was modified to produce this document. Every claim below was verified against the actual repository at `C:\Technical platform` — the full `schema.prisma` (707 lines), every backend module directory, every frontend route in `App.tsx`, the live `PracticeService`/`StudentHomePage`/weak-area code, the shared enums in `packages/shared`, and the existing design-system components — not carried over from memory of the P0/P1 session or from `docs/FINAL_PRODUCT_TRANSFORMATION_PLAN.md`'s own (already-accurate, cross-checked) claims about Learn.*

---

## 1. Current Learn-related capabilities — what exists today

**None.** Confirmed by reading the entire `schema.prisma` top to bottom: there is no `Course`, `LearningPath`, `Topic`, `Lesson`, `Module`, `Content`, `Progress` (lesson-shaped), `Quiz`, or `LessonProgress` model anywhere. The full model list is: `Role`, `User`, `RefreshToken`, `Question`, `CodingQuestion`, `CodingQuestionLanguage`, `CodingReferenceSolution`, `CodingStarterTemplate`, `CodingTestCase`, `McqQuestion`, `McqOption`, `AiGenerationRequest`, `QuestionReview`, `Assessment`, `AssessmentSection`, `AssessmentQuestion`, `AssessmentParticipant`, `Attempt`, `AttemptCodeDraft`, `PracticeCodeDraft`, `Submission`, `SubmissionTestResult`, `ExecutionJob`, `McqResponse`, `McqResponseOption`, `Result`. That's the whole schema.

The backend module list (`apps/api/src/modules/`) is: `ai`, `assessments`, `auth`, `execution-client`, `health`, `practice`, `questions`, `results`, `scoring`, `submissions`, `users`. No `learn`/`content`/`lessons` module.

**One important, honest finding not previously called out anywhere**: `docs/architecture.md` §1 states, verbatim: *"This is an **examination system**, not a learning platform. Every architectural choice below optimizes for: exam integrity..."* — that line was written as a deliberate scoping decision for the original build. Adding a genuine Learn pillar is a real product-direction expansion beyond that stated framing, not just a new page. Not a blocker (the codebase's actual architecture — NestJS/Prisma/Postgres modular services — supports this fine), but `docs/architecture.md` §1 should get a one-line update once this ships, and it's worth you knowing this is a deliberate pivot, not a gap-fill.

## 2. Existing question topics — can Learn connect to them safely?

Yes, cleanly — and better than a from-scratch design would produce, because the vocabulary is **already closed and already the load-bearing filter key everywhere**:

- `packages/shared/src/enums/question.enum.ts` defines `CODING_TOPICS` as a fixed 20-item `as const` array (`Arrays`, `Strings`, `Hashing`, `Sorting`, `Searching`, `Binary Search`, `Two Pointers`, `Sliding Window`, `Recursion`, `Backtracking`, `Linked Lists`, `Stacks`, `Queues`, `Trees`, `Binary Search Trees`, `Heaps`, `Graphs`, `Greedy Algorithms`, `Dynamic Programming`, `Bit Manipulation`) and a separate `MCQ_TOPICS` (8 CS-fundamentals topics — DSA, Programming, OOP, DBMS, OS, Networks, Architecture, Software Engineering).
- On the DB side, `Question.topics` is a plain `String[] @default([])` with a GIN index (`@@index([topics], type: Gin)`) — **not** a normalized foreign key, **not** a Postgres enum. The closed vocabulary is enforced only at the Zod layer (`z.enum(CODING_TOPICS)` in `question.schema.ts`), the same "string column, enum-validated at the edge" pattern used elsewhere in this schema (e.g. `ProgrammingLanguage` *is* a Postgres enum, but topics deliberately aren't — likely because a question can carry several).
- `PracticeService.getProgress()` already aggregates `byTopic` stats (`total`/`solved`/`attempted` per topic string) by pulling every approved question's `topics` array and reducing in application code (Prisma can't `groupBy` an unnested array column) — this exact pattern is the template Learn's own by-topic progress should reuse.
- The Explorer already supports `?topic=Arrays`-style deep links (`PracticeExplorerPage.tsx` reads `searchParams.get('topic')`), and this was just proven live end-to-end this session (weak-area card → `/student/practice/problems?topic=Strings` → correctly filtered).

**Conclusion**: Learn should key its content by this exact same `topic: string` vocabulary (validated against `CODING_TOPICS`), not invent a second `Topic` table with its own id/slug. Doing so means zero risk of the two systems' topic lists drifting apart, and "Practice this topic" becomes a one-line `Link to={`/student/practice/problems?topic=${topic}`}` — already a proven pattern, not new work.

## 3. Practice connection opportunities

Confirmed real, reusable surface area:
- `getNextRecommendedProblem` (added this session, `practice-api.ts`) already does topic-aware, unsolved-first, easiest-first problem selection — the same rule Learn's "Practice this topic" CTA should land on.
- `resolveWeakAreas` (`apps/web/src/lib/weak-areas.ts`) already computes real per-topic gaps (`total ≥ 2 && solved === 0`) from `PracticeProgressDto.byTopic`. Learn's landing page can read the *exact same* data shape without a new endpoint, to power a "topics you're weak in" section (mission's own request) — no fabrication, no new aggregation.
- **No duplicate question system risk**: Learn never needs its own problem bank. Every "practice this" action is a deep link into the existing Explorer with a topic filter, or (later, optional) a reference to an existing MCQ `Question` row for a knowledge check — see §10, phase F.

## 4. Existing progress system — what's reusable

- `PracticeService.getProgress(userId)` is the canonical "real progress, never fabricated" implementation: total/solved/attempted counts, byDifficulty, byTopic, recentActivity (from real `Submission` rows), and a `continueQuestion` pick (most-recently-touched unsolved problem, from submissions + drafts). This is called by **both** `PracticeLandingPage` and `StudentHomePage` — already the established "one aggregation, two consumers" pattern this codebase uses, and it's the template Learn's own progress endpoint should follow (see §7).
- `resolveContinueAction()` in `StudentHomePage.tsx` is the single deterministic "what should I do next" waterfall (already-live assessment > available assessment > continue-practicing > first-time nudge > keep-going). Learn needs to be woven into this same function, not create a second, competing "what's next" widget on the same page.
- **Nothing exists for "lesson progress" or "topic mastery" beyond practice-submission-derived stats.** Any Learn-specific progress (lesson read/completed) is genuinely new state — see the schema proposal.

## 5. Design system — components available to reuse, verbatim

Inspected directly (not summarized from memory): `AppShell.tsx`, `Card.tsx` (`Card`, `StatCard`), `Badge.tsx`, `ApprovalBadge.tsx` (`DifficultyBadge` etc.), `Button.tsx`, `PageHeader.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `Skeleton.tsx` (`Skeleton`, `SkeletonTable`, `LoadingRow`), `Modal.tsx` (real focus trap, `Escape`-to-close), `ConfirmDialog.tsx` + `useConfirm.tsx` (the *only* confirm pattern used anywhere in this app — never `window.confirm`), `Toast.tsx` (`ToastProvider`/`useToast`, already mounted at the app root in `main.tsx`), `Stepper.tsx` (dumb, caller-driven step rail — used today only by the Assessment Builder's 4-step flow).

CSS (`components.css`) already has directly-reusable primitives: `.stat-card-grid`/`.stat-card`, `.continue-card` (gradient hero, used by both Home and Practice landing today), `.progress-track`/`.progress-fill`, `.section-title-row`, `.activity-list`/`.activity-row`, `.assessment-group-title`/`.assessment-row`, `.checklist-item.ok/.pending` (from the Assessment Builder's live-validation checklist — a good visual match for a lesson's "what's covered here" or a knowledge-check summary), and the `.practice-completion`/`.review-panel-*` classes added this session (green success-banner idiom, status-forward header idiom).

**None of this needs replacing.** Learn should extend, not fork, this system — new CSS should live in `components.css` (or a new `learn.css` only if the volume genuinely warrants a dedicated file, matching the existing `exam.css`/`auth.css` split-by-surface convention already in place).

**One real gap**: there is no markdown/rich-text renderer anywhere in this codebase today. Every long-form text block currently in the product (problem statements, instructions) renders as `<p style={{whiteSpace:'pre-wrap'}}>{text}</p>` plus `<pre>` blocks for code — plain text, not Markdown. Recommendation: **do not add a Markdown dependency for Phase 16.** Follow the same plain-text-plus-`<pre>`-for-code convention already used by `PracticeWorkspacePage`'s problem panel. This keeps lesson authoring simple (admin types plain text + a code block field) and avoids a new dependency + XSS-surface (rendering arbitrary Markdown/HTML from an admin-authored field) for a first slice.

## 6. Content management — what Admin genuinely needs

Looked at the closest existing precedent, `AssessmentsService.addSection`/`updateSection` (`assessmentId` → ordered `AssessmentSection` rows): the pattern is `orderIndex ?? count(where: {parent})` for append-at-end, an explicit `orderIndex` accepted on update for reordering (no dedicated bulk "reorder" endpoint exists anywhere in this codebase — reordering is just repeated single-row `PATCH`es with a new index, presumably driven by a future drag-drop UI computing new indices client-side). This is the right amount of complexity to copy for Learn — **do not build a generic CMS**, build exactly this: create/list/get/update/delete + an `orderIndex` field + an `isPublished` boolean, matching the `Question.approvalStatus`-gates-visibility precedent (`PracticeService` only ever serves `approvalStatus: 'APPROVED'` questions to students — Learn's `isPublished` should gate student visibility the same way).

## 7. Data model proposal — minimum viable, maximum reuse

### The one real architectural decision to make: is "Topic" a new table, or a string?

**Recommendation: a string, validated against `CODING_TOPICS`, exactly like `Question.topics` already is.** Not a new `Topic` model. Rationale: the vocabulary already exists, is already closed, is already the join key for Practice/weak-areas/Explorer filtering. A second `Topic` table would either (a) duplicate `CODING_TOPICS` as seed rows — a second source of truth that can drift — or (b) require migrating `Question.topics` to reference it, which is out of scope and risks the existing, working Practice/Assessment/AI-generation pipelines that already depend on `Question.topics` being a plain string array. Keeping Learn's topic key as a validated string means zero risk to anything already shipped.

### Proposed models (one migration, additive only — nothing existing changes shape)

```prisma
model Lesson {
  id             String   @id @default(uuid()) @db.Uuid
  // Validated against CODING_TOPICS at the Zod layer — same vocabulary as
  // Question.topics, deliberately not a separate Topic table (see audit §7).
  topic          String
  title          String
  // Shown in list/card views and as the Learn landing page's topic summary.
  summary        String
  // The actual lesson body. Plain text (pre-wrapped), matching every other
  // long-form field in this codebase — no Markdown renderer exists or is
  // being added (see audit §5).
  concept        String
  example        String?  @map("example")
  commonMistakes String?  @map("common_mistakes")
  orderIndex     Int      @default(0) @map("order_index")
  isPublished    Boolean  @default(false) @map("is_published")
  createdById    String   @map("created_by") @db.Uuid
  createdBy      User     @relation("LessonCreatedBy", fields: [createdById], references: [id])
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  progress LessonProgress[]

  @@index([topic, orderIndex])
  @@index([isPublished])
  @@map("lessons")
}

/// Binary — a lesson is either completed or not, mirroring the platform's
/// existing "solved/not solved" mental model rather than introducing partial
/// progress. (userId, lessonId) unique — re-completing is a harmless upsert.
model LessonProgress {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  lessonId    String   @map("lesson_id") @db.Uuid
  lesson      Lesson   @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  completedAt DateTime @default(now()) @map("completed_at") @db.Timestamptz(6)

  @@unique([userId, lessonId])
  @@index([userId])
  @@map("lesson_progress")
}
```

`User` gains two new back-relations (`createdLessons`, `lessonProgress`) — purely additive, same pattern as every other `User` relation already in the schema.

**Deletion behavior**: `onDelete: Cascade` on `LessonProgress.lesson`/`.user`, matching every other per-user progress table in this schema (`PracticeCodeDraft`, `Submission.practiceUser`). Deleting a `Lesson` cleanly drops its progress rows; deleting a `User` cleanly drops their lesson-progress rows. No orphaned data possible.

**Indexes**: `@@index([topic, orderIndex])` is the one that matters — it's exactly the access pattern "give me this topic's published lessons in order," used by every student-facing read. `@@index([isPublished])` supports the admin list's publish/unpublished filter cheaply.

**What this deliberately does NOT include (and why):**
- No `LearningPath`/`Module` table in the first slice — see §10 Phase E. Topic-as-string already gives a real, browsable structure (`/learn`, `/learn/Arrays`, `/learn/Arrays/lessons/:id`) without it.
- No `KnowledgeCheck`/quiz table — the mission explicitly forbids a second question system. If knowledge checks are approved later, they should be a thin join (`LessonKnowledgeCheck(lessonId, questionId, orderIndex)`) onto the **existing** `Question`/`McqQuestion` rows, not a new content type. See §10 Phase F.
- No rich content blocks / structured JSON body — plain fields matching the rest of the codebase's conventions (see §5).

## 8. Student user journey (as this architecture would actually support it)

```
Login → Home
          │
          ├─ resolveContinueAction() gains a new, real tier: an in-progress
          │  topic's next uncompleted lesson (by orderIndex) — computed from
          │  real LessonProgress rows, not invented. Priority position TBD
          │  in implementation (see §9 open question).
          │
          └─ new "Learn" nav item (between Home and Practice, matching the
             mission's own diagram) → Learn landing
                    │
                    ├─ "Continue learning" hero (same .continue-card idiom
                    │  already used by Home/Practice) — only rendered if a
                    │  real in-progress topic exists
                    ├─ Topics grid — one row per topic that has ≥1 published
                    │  lesson, each showing real completed/total, sourced
                    │  from the same aggregation style as byTopic in
                    │  PracticeService.getProgress
                    └─ (if weak areas exist) a cross-link: "Weak in Strings —
                       start here" pointing at that topic's lesson list
                              │
                              ▼
                    Topic page (/learn/:topic)
                    ├─ ordered lesson list, each showing completed/not
                    └─ topic-level "Practice <topic> problems" CTA — the
                       exact existing Explorer deep-link pattern
                              │
                              ▼
                    Lesson page (/learn/:topic/lessons/:id)
                    ├─ breadcrumb: Learn / <topic> / <lesson title>
                    ├─ concept → example → common mistakes (only the
                    │  sections that have real content — no empty
                    │  placeholder sections)
                    ├─ "Mark complete" → real POST, LessonProgress written
                    └─ completion moment (same visual family as the practice
                       completion banner shipped this session):
                       primary: "Practice <topic> problems" → Explorer,
                       filtered secondary: "Next lesson" (if one exists in
                       this topic) secondary: "Back to <topic>"
```

This directly satisfies the mission's own "no dead ends" rule at every step, using the exact same completion-moment pattern already proven live this session for practice.

## 9. Admin journey

```
Admin → new "Lessons" nav item (ADMIN_NAV, alongside Question Bank —
        a parallel content-management surface, not merged into it)
           │
           ▼
        Lessons list — filter by topic/published-status, search by title
        (same filters-row/table/EmptyState/SkeletonTable pattern as
        AdminQuestionBankPage and the new AdminUsersPage)
           │
           ├─ Create lesson → topic select (CODING_TOPICS dropdown, same
           │  enum already used by AdminQuestionFormPage/AdminAIGeneratorPage)
           │  + title + summary + concept + example + common mistakes
           │  + orderIndex (default: append-to-end, same rule as
           │  AssessmentsService.addSection)
           │
           ├─ Edit lesson → same form, prefilled
           │
           ├─ Publish/unpublish toggle → real confirm dialog (useConfirm,
           │  never window.confirm) before unpublishing a lesson students
           │  may already be mid-way through
           │
           └─ Delete → real confirm dialog, cascades LessonProgress
```

**Decided (2026-09-14):** rank by recency. The Learn tier is compared against the practice-continuation tier by actual recency (last `LessonProgress` write vs. the practice `continueQuestion`'s recency) — whichever the student touched more recently wins. Both still sit below the two assessment tiers (an in-progress/available assessment always wins — time-boxed, matches the existing rule). This is not a fixed pillar hierarchy.

## 10. Phase breakdown

Each phase is independently reviewable and demoable. Vertical slices, in dependency order.

**P16-A — Core Learn architecture (backend only)**
Prisma migration (`Lesson`, `LessonProgress`, plus the two `User` back-relations); `packages/shared/src/schemas/learn.schema.ts` (`CreateLessonSchema`, `UpdateLessonSchema`, `ListLessonsQuerySchema` for admin; a student-facing query schema for listing published lessons by topic); new `LearnModule` (`learn.controller.ts`, `learn.service.ts`, `dto/learn.dto.ts`) wired into `AppModule`, mirroring `PracticeModule`'s existing shape. Endpoints:
- `POST /lessons`, `GET /lessons`, `GET /lessons/:id`, `PATCH /lessons/:id`, `DELETE /lessons/:id` — ADMIN
- `GET /learn/topics` — STUDENT, real per-topic lesson counts + this student's completed count (same aggregation style as `PracticeService.getProgress().byTopic`)
- `GET /learn/topics/:topic/lessons` — STUDENT, published lessons only, ordered, with per-lesson completed flag
- `GET /learn/lessons/:id` — STUDENT, one published lesson + completed flag
- `POST /learn/lessons/:id/complete` — STUDENT, idempotent upsert into `LessonProgress`
- `GET /learn/progress` — STUDENT, the Learn-side counterpart to `practice/progress`: totals, byTopic, a `continueLesson` pick — built for reuse by both the future Learn landing page and `StudentHomePage`
No frontend in this phase. Verified via typecheck/lint/build/unit tests plus direct API exercise (not a UI walkthrough yet — nothing to click).

**P16-B — Admin content management**
`AdminLessonsPage.tsx` (list/filter/publish-toggle/delete) + `AdminLessonFormPage.tsx` (create/edit) + `apps/web/src/lib/learn-api.ts` + new `ADMIN_NAV` entry. Verified live: create → edit → publish → unpublish → delete, all against the real API, all through real confirm dialogs.

**P16-C — Student Learn experience**
`LearnLandingPage.tsx`, `LearnTopicPage.tsx`, `LearnLessonPage.tsx` + new `STUDENT_NAV` entry + new full routes in `App.tsx`. The completion moment, the "Practice this topic" deep link, the breadcrumb. Verified live: a student reads a real published lesson end-to-end, completes it, is offered a real next action, and the practice deep-link genuinely filters the Explorer.

**P16-D — Home integration**
`resolveContinueAction()` gains the Learn tier (per the open question in §9 — needs your answer first); weak-area cards optionally cross-link to a topic's lessons when any exist for that topic. Verified live: the full audit-required journey — admin creates → publishes → student sees on Home → opens → completes → progress updates → practices → returns later → continues where left off.

**P16-E — deferred indefinitely: Learning Paths.** Not scoped further; revisit only if separately requested in a future session.

**P16-F — deferred indefinitely: Knowledge checks via the existing MCQ bank.** Not scoped further; revisit only if separately requested in a future session.

## 11. Risks

- **`docs/architecture.md` §1's "not a learning platform" framing is now stale** the moment P16-A merges — a one-line doc correction, not a code risk, but worth doing so a future reader isn't misled (same category of drift this session's P0 work already fixed once for `docs/PRODUCT_GUIDE.md`).
- **The `resolveContinueAction` priority-order question (§9) is a real product decision, not an implementation detail** — get it wrong and Home either buries genuinely time-sensitive assessment/practice state under a lower-value "go read a lesson" nudge, or never surfaces Learn at all. Flagged for your sign-off, not guessed at.
- **Content quality risk, not engineering risk**: the mission explicitly (and correctly) forbids fabricated/placeholder lesson content. P16-B/C ship the *system*; only a small number of genuinely well-written demo lessons should be seeded (or none — an empty Learn section with a correct, honest `EmptyState` is a fine and truthful P16-C deliverable on its own). This is a content-authoring decision for you, not something to solve by generating volume.
- **Scope discipline**: this is the single largest net-new surface added to the product since its original build. The phase gating in §10 exists specifically so each slice ships reviewable and working before the next starts — resist the temptation to build P16-E/F alongside A–D "since we're in here."
- **None of P16-A–D touch execution, authentication, scoring, or the assessment/exam integrity model** — lowest-risk category, same as the P0/P1 work.

## 12. What will change

- One additive Prisma migration (two new tables, two new `User` back-relations — nothing existing altered).
- `packages/shared`: one new schema file.
- `apps/api`: one new module (`learn`).
- `apps/web`: one new API client (`learn-api.ts`), up to 5 new page components across phases, two new nav entries (`STUDENT_NAV`, `ADMIN_NAV`), new routes in `App.tsx`, `resolveContinueAction` in `StudentHomePage.tsx` gains one more tier (P16-D only), possibly a small addition to `WeakAreasCard`/`resolveWeakAreas` call sites for the cross-link (P16-D only, additive).
- Possibly one new CSS section in `components.css` (or a new `learn.css` if warranted by volume).

## 13. What will NOT change

- No existing table's shape changes. No existing endpoint's contract changes.
- Practice, Assessments, Results, AI generation, auth, execution — untouched.
- The design system is extended, not replaced (§5).
- No Docker, no new runtime dependencies, no deployment-architecture changes.
- No `LearningPath`/quiz system unless you explicitly approve Phase E/F separately.

---

## Summary for approval

1. **What exists**: nothing — confirmed against the real schema and every module/route list, not assumed.
2. **What's missing**: the entire Learn pillar — content model, admin authoring, student reading experience, progress tracking, Home integration.
3. **Proposed architecture**: topic-as-string (reusing `CODING_TOPICS`, no new Topic table), a `Lesson`/`LessonProgress` pair mirroring existing progress-tracking conventions, a new `LearnModule` mirroring `PracticeModule`'s shape, frontend pages reusing the existing design system verbatim.
4. **Proposed schema**: §7 — two models, additive-only migration.
5. **Implementation phases**: §10 — P16-A (backend) → P16-B (admin) → P16-C (student) → P16-D (Home integration) → P16-E/F (optional, separately gated: Learning Paths, Knowledge Checks).
6. **Risks**: §11 — mainly a real product decision on Home's priority ordering, and content-quality discipline, not engineering risk.
7. **What changes / doesn't**: §12/§13.

## Approved (2026-09-14)

- Home priority: rank by recency (§9, updated above).
- P16-E/F: deferred indefinitely, not part of this implementation pass.
- Demo content: none seeded — Learn ships with an honest, correct `EmptyState` until real content is authored through the new admin UI.

Implementation proceeds through P16-A → P16-D as scoped in §10.

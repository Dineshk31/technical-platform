# Phase 16 — The Learn Pillar: Completion Report (P16-A → P16-D)

*Implements the plan approved in `docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md` after your three sign-offs (Home priority: rank by recency; P16-E/F: deferred indefinitely; demo content: none seeded). P16-E (Learning Paths) and P16-F (Knowledge Checks) were explicitly out of scope for this pass, per your decision.*

---

## 1. What was built

**P16-A — Core architecture (backend).** One additive Prisma migration (`20260914073711_add_learn_lessons`) adding `Lesson` and `LessonProgress` — no existing table changed shape. A new `LearnModule` mirroring `PracticeModule`'s exact split: `LessonsController`/`LessonsService` (ADMIN CRUD at `/lessons`) and `LearnController`/`LearnService` (STUDENT read + progress at `/learn/*`). New shared schema `packages/shared/src/schemas/learn.schema.ts`.

**P16-B — Admin content management.** [`AdminLessonsPage.tsx`](apps/web/src/pages/AdminLessonsPage.tsx) (search/filter/publish-toggle/delete) and [`AdminLessonFormPage.tsx`](apps/web/src/pages/AdminLessonFormPage.tsx) (create/edit), reusing the exact filters-row/table/`EmptyState`/`SkeletonTable`/`useConfirm`/`useToast` conventions already established by `AdminQuestionBankPage`/`AdminUsersPage`. New "Lessons" admin nav item.

**P16-C — Student Learn experience.** [`LearnLandingPage.tsx`](apps/web/src/pages/LearnLandingPage.tsx) (topics-by-progress grid + continue-card), [`LearnTopicPage.tsx`](apps/web/src/pages/LearnTopicPage.tsx) (ordered lesson list + topic-level Practice CTA), [`LearnLessonPage.tsx`](apps/web/src/pages/LearnLessonPage.tsx) (the reading experience + a real completion moment reusing the exact `.practice-completion` visual family shipped for Practice). New "Learn" student nav item, positioned between Home and Practice per the mission's own diagram.

**P16-D — Home integration.** `StudentHomePage`'s `resolveContinueAction()` gained a genuine recency comparison between "continue practicing" and "continue learning" — not a fixed pillar order (per your decision). `WeakAreasCard` gained an optional second CTA ("Learn `<topic>` first") shown only when real published lessons exist for that weak topic.

## 2. What uses real database data

Everything. No fabrication anywhere:
- Topic progress (`byTopic` on `GET /learn/progress`) is computed the same way `PracticeService.getProgress().byTopic` already is — real counts from `Lesson`/`LessonProgress` rows, only ever including topics with ≥1 *published* lesson.
- `continueLesson` is a real deterministic rule: among topics with 0 < completed < total, the one most recently touched (`MAX(LessonProgress.completedAt)`), then the next uncompleted lesson in that topic by `orderIndex`. A topic that reaches 100% completion correctly drops out of contention — verified live (see §4).
- The Home recency comparison uses real timestamps from both sides (`practice.continueQuestion.lastActivityAt`, `learn.continueLesson.lastActivityAt`) — a small, additive backend change to `PracticeService.getProgress()` to expose a timestamp that already existed internally but wasn't returned before.
- The "Learn `<topic>` first" weak-area cross-link only renders when `learnProgress.byTopic` genuinely contains that topic — real data, never assumed.

## 3. New backend APIs

| Route | Role | Purpose |
|---|---|---|
| `POST /lessons` | ADMIN | Create a lesson (draft by default) |
| `GET /lessons` | ADMIN | List/filter/search lessons |
| `GET /lessons/:id` | ADMIN | Full detail for editing |
| `PATCH /lessons/:id` | ADMIN | Update fields, reorder, publish/unpublish |
| `DELETE /lessons/:id` | ADMIN | Delete (cascades `LessonProgress`) |
| `GET /learn/progress` | STUDENT | Totals, `byTopic`, `continueLesson` — the Learn counterpart to `practice/progress` |
| `GET /learn/topics/:topic/lessons` | STUDENT | Published lessons in a topic, ordered, with completed flags |
| `GET /learn/lessons/:id` | STUDENT | One published lesson + completed flag (404 if unpublished/missing) |
| `POST /learn/lessons/:id/complete` | STUDENT | Idempotent completion upsert |

No schema/migration changes beyond the one additive migration above.

## 4. Testing performed

- `npm run typecheck` / `npm run lint` / `npm run build` — clean across all four workspaces (re-run after every code change, most recently after the P16-D `resolveContinueAction`/`WeakAreasCard` edits).
- `npm run test` (API unit specs) — 23/23 passing, no regressions.
- **Full live browser walkthrough**, both roles, against the real stack:
  - **Admin**: created two real, substantive lessons in Arrays ("Introduction to Arrays", "Traversing and Modifying Arrays") and two in Hashing ("What is Hashing?", "Hash Maps in Practice") through the actual admin UI — not seeded, not fixtures. Published all four. Confirmed the list view's ordering/status columns and the publish/unpublish toggle round-trip correctly.
  - **Student**: confirmed the honest empty state ("No lessons published yet") before any content existed. After publishing, confirmed the Learn landing page's real topic cards, the topic page's ordered lesson list with correct not-started/completed pills, and the lesson reading page rendering Concept/Example/Common mistakes — each section only when the admin actually filled it in (confirmed the Example section correctly does *not* render for the one lesson left without one).
  - **Completion moment**: marked lessons complete and confirmed the real "Next lesson" CTA (present when one exists in-topic, absent — replaced by "Back to `<topic>`" — when it doesn't), and confirmed "Practice `<topic>` problems" deep-links into a correctly topic-filtered Explorer.
  - **Home recency algorithm — the one genuinely new piece of logic this phase touches — was stress-tested, not just typechecked**: completed a Hashing lesson while Practice had no active `continueQuestion` → Home correctly showed "Continue Learning." Then touched an unsolved Practice problem (a debounced draft save) → Home correctly flipped to "Continue Practicing," proving a real recency comparison rather than a fixed order. Then completed Hashing's second lesson, which brought that topic to 100% — Home correctly did *not* revert to a stale "Continue Learning" pointing at a finished topic, staying on Practice, which is the mathematically correct outcome of the documented rule (a topic only qualifies while `0 < completed < total`).
  - Confirmed no console errors and no server errors throughout.

### A bug the live walkthrough caught in this session's own test methodology (not the app)
Several early form-fill attempts silently produced duplicated/concatenated text because this environment's synthetic `ctrl+a`/`ctrl+Home`/`ctrl+shift+End` key combinations don't reach the page reliably (plain character typing does). Every field that showed this was re-verified against the live DOM value (via direct inspection, not just a screenshot) before submission — the final lesson content saved to the database is exactly what was intended, confirmed by re-reading it back from Postgres after publishing (§ below).

## 5. What remains unfinished / explicitly deferred

- **P16-E (Learning Paths) and P16-F (Knowledge Checks)** — not started, per your explicit "defer both indefinitely" decision. The schema proposal for both remains in the audit doc (§10) if you want to pick this up later.
- **No demo/seed content beyond what was created live during this session's own verification** — per your "ship empty, honest EmptyState" decision, no lessons were pre-seeded before this session; the four lessons now in the database are real, substantive content created through the admin UI as part of proving the vertical slice works end-to-end, not throwaway fixtures (left in place deliberately, same judgment call as editing the real Test Student's department/batch during the P0/P1 session).
- **No responsive/accessibility-specific pass for the new Learn pages** — they reuse existing, already-audited layout primitives (`dashboard-body`, `card`, `activity-list`, `.practice-completion`), but weren't independently re-verified at narrow viewports.
- **The weak-area → Learn cross-link ("Learn `<topic>` first") was verified by code review and by confirming its data source (`learnProgress.byTopic`) is correct, but not visually exercised live** — no topic in the current real dataset simultaneously satisfies the weak-area rule (`total ≥ 2 && solved === 0`) and has published lessons, so the specific combined UI state wasn't screenshotted. The underlying logic (a `Set` built from real topic names, conditionally rendering a second CTA) is straightforward and was reviewed, not guessed at.

## 6. Known limitations

- A lesson's content is plain text (no Markdown/rich-text), matching every other long-form field in this codebase (problem statements, instructions) — intentional, per the audit's §5 recommendation against adding a new rendering dependency for this phase.
- `orderIndex` reordering is manual (set a new number via PATCH) — there's no drag-and-drop reorder UI, matching the exact same limitation already accepted for `AssessmentSection`/`AssessmentQuestion` ordering elsewhere in this codebase.
- Lesson completion is binary (no partial/in-progress state for a single lesson) — a deliberate simplification matching the platform's existing solved/not-solved mental model, documented in the audit.

## 7. Deployment impact

One additive Prisma migration to run (`npx prisma migrate deploy` picks it up automatically — nothing manual). No new environment variables, no new npm dependencies, no Docker, no deployment-architecture changes. Fully backward-compatible: every new API route is additive, no existing contract changed shape except `PracticeContinueQuestion` gaining one new field (`lastActivityAt`) — additive, not breaking.

## 8. Honest readiness assessment

The core Learn loop — author a lesson, publish it, a student reads it, completes it, is offered a real next action, practices the real underlying problem set, and Home genuinely tracks which of Learn/Practice they touched most recently — works end-to-end against the real database, not a demo. The one new piece of non-trivial logic this phase introduces (the recency-based Home priority) was specifically stress-tested with a live flip-flop, not assumed correct because it typechecked.

This is P16-A through P16-D only. Learning Paths and Knowledge Checks remain real, larger, separately-gated future work — exactly as scoped and approved.

---

## 9. Exact git status at end of session

```
 M apps/api/prisma/schema.prisma
 M apps/api/src/app.module.ts
 M apps/api/src/modules/practice/practice.service.ts
 M apps/web/src/App.tsx
 M apps/web/src/components/AppShell.tsx
 M apps/web/src/components/WeakAreasCard.tsx
 M apps/web/src/lib/practice-api.ts
 M apps/web/src/pages/PracticeLandingPage.tsx
 M apps/web/src/pages/StudentHomePage.tsx
 M packages/shared/src/index.ts
?? apps/api/prisma/migrations/20260914073711_add_learn_lessons/
?? apps/api/src/modules/learn/
?? apps/web/src/lib/learn-api.ts
?? apps/web/src/pages/AdminLessonFormPage.tsx
?? apps/web/src/pages/AdminLessonsPage.tsx
?? apps/web/src/pages/LearnLandingPage.tsx
?? apps/web/src/pages/LearnLessonPage.tsx
?? apps/web/src/pages/LearnTopicPage.tsx
?? docs/PHASE_16_LEARN_ARCHITECTURE_AUDIT.md
?? docs/PHASE_16_LEARN_COMPLETION_REPORT.md
?? packages/shared/src/schemas/learn.schema.ts
```

Nothing committed — all uncommitted working-tree state, pending your review. Database state: 4 real, published lessons (2 Arrays, 2 Hashing) authored live during this session's own verification, all currently marked complete by the one real test student account — no fixture/`@test.local` accounts were created.

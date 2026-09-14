# Final Product Transformation Plan — Centurion Technical Platform

*Written after a fresh discovery pass over the real repository, the real Prisma schema, every backend controller, every frontend route, and a live walkthrough of both roles in the browser (admin and student, on the actual running dev stack — API :4000, web :5173, execution-service :4100, real Postgres data). Nothing below is carried over unverified from `docs/PRODUCT_TRANSFORMATION_AUDIT.md` or `docs/PRODUCT_GUIDE.md` — both were re-checked against the code, and two concrete drifts were found and are called out in §B. This document supersedes the older audit for planning purposes; it does not repeat its already-shipped P0 work (see §A.4), it builds on top of it.*

---

## A. Current Product Map

### A.1 Architecture (unchanged, confirmed)

Four npm workspaces, one Postgres database, no Docker anywhere:

- `apps/web` — React 19 + Vite + React Router 7, Monaco editor, a real custom CSS design-token system (`apps/web/src/styles/*.css`), no state library beyond `useState`/`useEffect`/`AuthContext`.
- `apps/api` — NestJS. All business logic, all authorization, the only service the browser talks to.
- `apps/execution-service` — separate Node process, `127.0.0.1`-only, polls a Postgres table (`execution_jobs`) as its job queue. Compiles/runs C++/Java/Python.
- `packages/shared` — Zod schemas, enums, types shared by API and web.

Deployment target (unchanged, correctly documented in `docs/DEPLOYMENT.md`/`docs/PRODUCT_GUIDE.md` §11): Linux VPS, Nginx, systemd services for API and execution-service, static-built React frontend, no Docker. This plan does not touch that direction.

### A.2 Complete backend route inventory (read from the actual controllers, not docs)

| Module | Routes |
|---|---|
| `auth` | `POST /login`, `POST /refresh`, `POST /logout`, `GET /me` |
| `users` | `GET /users` (list, role filter only), `POST /users` (create), `GET /users/:id` |
| `questions` | `POST /coding`, `POST /mcq`, `PATCH /mcq/:id`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/review`, `POST /:id/test-cases`, `PATCH /:id/test-cases/:id`, `DELETE /:id/test-cases/:id` |
| `assessments` | `POST /`, `GET /`, `GET /assigned`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/publish`, `/unpublish`, `/archive`, section/question/participant CRUD, `POST /:id/start`, `GET /:id/status`, `GET /:id/questions`, `POST /:id/mcq/:qid/answer`, `POST /:id/submit` |
| `attempts` | `GET /:id`, `GET /:id/drafts`, code-draft save |
| `submissions` | `POST /attempts/:id/questions/:id/run`, `/submit`, `GET /submissions/:id`, `GET /attempts/:id/questions/:id/submissions` |
| `practice` | `GET /questions`, `GET /progress`, `GET /questions/:id`, draft save, `POST /questions/:id/run`, `/submit`, `GET /questions/:id/submissions` |
| `results` | `GET /assessments/:id/result`, `GET /assessments/:id/results`, `GET /assessments/:id/results/:attemptId` |
| `ai` | `POST /ai/questions/generate`, `GET /ai/questions/requests/:id`, `POST /ai/questions/requests/:id/save` |
| `health` | `GET /health` |

**No `GET/PATCH /assessments/:id/ranking` route exists** — confirmed still absent. Rank is now returned as a field on the three result endpoints instead (this session's own work — see §A.4), which is the smaller, already-correct fix; a standalone ranking route was never actually needed.

### A.3 Complete frontend route inventory (from `App.tsx`, verified against the file, not memory)

**Admin** (`AppShell role="ADMIN"`, 4 sidebar items: Assessments, Question Bank, AI Generator, AI Review Queue): `/admin` (Command Center), `/admin/assessments/:id`, `/admin/questions`, `/admin/questions/new`, `/admin/questions/ai-generate`, `/admin/questions/mcq/new|:id/edit`, `/admin/questions/:id/edit`, `/admin/assessments/:id/results`, `/admin/assessments/:id/results/:attemptId`.

**Student** (`AppShell role="STUDENT"`, 2 sidebar items: Home, Practice): `/student` (Home), `/student/assessments/:id`, `/student/attempts/:attemptId/result`, `/student/practice`, `/student/practice/problems`.

**Full-bleed** (outside `AppShell`): `/student/attempts/:attemptId` (exam), `/student/practice/problems/:id` (practice workspace).

**Still true from the old audit**: no 404 page (`path="*"` just redirects to `/`), no Profile/settings route for either role, no Admin Users route despite a partial backend.

### A.4 What has already shipped since the old audit (do not re-plan this)

Verified live this session, not just read in git log:
- Student Home rebuilt with a real deterministic continue-card, practice progress, and assessment discovery now split into **In progress / Available now / Submitted — awaiting results** (not just one flat "Available now" bucket).
- Admin Command Center with real "needs attention" stat cards.
- 4-step guided Assessment Builder (`Assessment details → Build assessment → Participants → Review & publish`) for `DRAFT` assessments, with a live checklist on the review step that mirrors the server's own publish validation — verified live this session by creating and deleting a throwaway draft.
- Practice Mode: landing page, explorer with working sort (`newest/easiest/hardest/recommended`) and filters, a genuinely good Monaco workspace, topic + difficulty progress, recent activity — all verified live this session.
- Question Bank sort (`newest/oldest/title/easiest/hardest`).
- AI Generator restructured into a visible `Configure → Review generated → Saved` stepper flow — verified live this session end-to-end against the real Gemini pipeline.
- `results.rank` (previously computed, never returned by any endpoint) is now returned by all three result endpoints and shown as a stat tile / roster column — verified live this session.
- Database cleaned of ~72 `@test.local` fixture accounts and ~26 fixture assessments/38 fixture questions; a test-database architecture investigation was completed (root cause: `ConfigModule.forRoot` has no `NODE_ENV`-based env-file branching, so `test:e2e` reads the exact same `.env`/`DATABASE_URL` as `dev:api` — no fix applied yet, investigation only).

### A.5 Data model — what exists and what genuinely does not

Read the full 706-line `schema.prisma`, not a summary. Confirmed:
- **No Learn/Topic/Lesson/Concept entity exists anywhere.** `Question.topics` is a plain `String[]` tag array used only for filtering and progress aggregation (`@@index([topics], type: Gin)`) — it is not a curriculum structure. There is no model that could hold a lesson body, a concept explanation, or an ordered learning path. A "Learn" pillar (mission §8) is **net-new schema, net-new backend, net-new frontend** — not a matter of exposing something that already exists.
- **No streak/activity-feed model** beyond raw `Submission`/`Attempt` rows (which `recentActivity` already reads honestly).
- **No "faculty"/"proctor" role**, no plagiarism/anti-cheat table, no leaderboard table beyond `Result.rank` (per-assessment only, never cross-assessment).
- **`Result.rank` is per-assessment**, not a global/cross-assessment ranking. A "Compete" pillar (mission's journey diagram) as a *platform-wide* leaderboard would need a new aggregation, not just more UI on the existing field.

---

## B. Product Experience Audit

### B.1 What already feels like a real product (verified live, not assumed)

- **Login page** — still the calibration target; genuinely designed, not a template.
- **Practice Mode** (landing → explorer → workspace) — real stat cards, real progress bars by difficulty and by topic (topic rows deep-link into the filtered explorer — confirmed working), a working sort/filter/search row, and a bespoke three-pane coding workspace reusing the exam's Monaco chrome. This is the strongest area of the product today.
- **Assessment Builder** (`DRAFT` state) — the 4-step `Stepper` with a live, server-validation-mirroring checklist on the final step is a genuine "guided workflow" moment, not a form.
- **AI Generator** — now a real staged flow (Configure → Review → Saved) with live hints per step and correct checkmarks.
- **Exam-taking page and the new `SubmitReviewModal`** (verified in an earlier session this week, and its bug-fix — questions-data going stale after answering — re-verified) — a focused, serious "I am taking an exam" shell, distinct from the rest of the app by design.

### B.2 What still feels like a CRUD dashboard

- **`QuestionReviewPanel`** (`apps/web/src/components/QuestionReviewPanel.tsx`) — the actual approve/reject/needs-edit/send-back-to-review UI that every AI-generated *and* manually-created question goes through. It is a card with a textarea, five buttons in a row, and a plain `<table>` of review history. This is the exact "title + filter row + table + CRUD buttons" shape the mission calls out — and it's the direct next step after the AI Generator's new, much better staged flow, so today the AI journey visibly *improves* through Configure/Review/Saved and then *drops back down* in quality the moment you open a saved question to actually approve it. This is the single most concrete "disconnected experience" found this session.
- **Published/locked assessment detail view** (`AdminAssessmentDetailPage`'s `PublishedView`) — functionally correct (structural fields locked, only description/instructions/participants editable) but visually still three stacked cards of labels and inputs. Lower priority than the review panel above because it's a rarely-revisited, mostly-read screen once an assessment is live.
- **Results roster and per-attempt detail** — functional stat tiles now include rank, but the roster itself is still a bare `<table>` with a filter row, structurally identical to the Question Bank table before this session's sort work.
- **`AdminMcqFormPage` / `AdminQuestionFormPage`** — long, flat forms (confirmed by line count: 495 lines for the coding-question form alone), not staged like the AI Generator now is, despite covering conceptually similar ground (title → statement → examples → test cases → languages → solutions).

### B.3 Dead ends and disconnected experiences (new findings, not in the old audit)

1. **Solving a practice problem still has no completion moment.** `ExecutionResultPanel.tsx` (shared by exam and practice) renders only the verdict and test breakdown — there is no "Next problem" / "Back to Practice" CTA anywhere in `PracticeWorkspacePage.tsx` or the shared result panel. **This directly contradicts this session's own prior status notes**, which stated this was implemented — it is not in the code. Mission §7 explicitly requires this ("the product must answer: WHAT NEXT?"). This is the clearest, most fixable dead end in the whole product.
2. **No Admin Users page, and the backend can't fully support one yet.** Confirmed by reading `users.controller.ts` directly: there is `GET /users` (list, filterable by role only — no search, no department/batch filter), `POST /users` (create), and `GET /users/:id`. **There is no `PATCH /users/:id`.** The old audit's claim that "GET/POST/PATCH /users exists" is wrong — PATCH was never built. A real admin Users page (edit department/batch/role, deactivate a student) needs a small backend addition first, not just a UI wrapper over what exists.
3. **Admin topbar/page-title mismatch.** `/admin`'s `<h1>` says "Command Center" (this session's own P0 work), but `AppShell`'s topbar derives its title from the nav item label ("Assessments") whenever the pathname matches, so the browser topbar still reads "Assessments" above a page that calls itself "Command Center." Small, but a real, easily-fixed cohesion nit — exactly the kind of thing the mission's "create continuity between pages" rule is about.
4. **Students have no dedicated "Assessments" nav entry.** The sidebar is Home + Practice only; assessments live inside Home's scroll. That's a reasonable P0 decision (avoid two competing "landing" surfaces) but it means a returning student who specifically wants their assessment list has no direct nav path to it — they must remember it's on Home.
5. **AI review approval has no "where approved content goes" signal.** After approving a question in `QuestionReviewPanel`, there's no link back to "attach this to an assessment now" or any next-step affordance — it just re-renders the same form with an updated badge.

### B.4 Documentation drift found and corrected here

- `docs/PRODUCT_GUIDE.md` §6 "Rankings: … no screen or API endpoint currently displays it" and §14's "Ranking / leaderboard: ⚠️ Computed, never exposed — No, don't demo this" are **now stale** as of this session's rank-wiring work. `docs/PRODUCT_GUIDE.md` should get a one-line correction pass after this plan is approved (not done as part of this audit, since the instruction was audit-only).
- The old `docs/PRODUCT_TRANSFORMATION_AUDIT.md` §4 table claims a Users page needs "no new backend capability" — corrected in §B.3.2 above: it needs at minimum a `PATCH /users/:id`.

---

## C. Student Journey

### C.1 Current journey (as it actually behaves today)

```
Login → Home (continue-card, practice progress, assessment groups, recent activity)
          ├─→ Practice landing → Explorer (search/filter/sort) → Workspace (solve) → [DEAD END — no next-step CTA]
          └─→ Assessment detail → Start → Exam (timer, nav, run/submit, review-before-submit) → Submit
                                                                                                    → Result (only after window closes)
```

There is no "Learn" branch (doesn't exist) and no "Compete" branch (rank exists but is only visible after finishing one specific assessment's own result — never a cross-assessment or cross-student comparative view a student can browse to on their own).

### C.2 Desired journey (mission's DISCOVER → LEARN → PRACTICE → SOLVE → TRACK → IMPROVE → COMPETE → ASSESS, mapped onto what's actually feasible)

- **DISCOVER**: Home's continue-card (exists, real) + a student-visible "Assessments" surface with its own nav entry (recommended addition, §D).
- **LEARN**: genuinely does not exist. Recommendation (§E, P2): do **not** build a full LMS. If approved, build exactly one complete vertical slice (mission's own instruction) — e.g. one topic (Arrays), one concept overview, worked examples already present on questions, then a link into filtered Practice problems for that topic. This needs new schema (§F) and is the single largest net-new scope item in this plan.
- **PRACTICE**: exists and is strong. Gap: no completion moment (§B.3.1, §E P0).
- **SOLVE**: exists (Monaco workspace, run/submit, both exam and practice) — genuinely solid, do not rebuild.
- **TRACK**: exists (difficulty progress, topic progress, recent activity, assessment results with rank) — real, DB-backed, no fabrication found anywhere.
- **IMPROVE**: partially exists via the deterministic continue-card recommendation rule; no "weak topic" callout exists (correctly, since mission explicitly says never fabricate this without a real rule — a real rule is proposable, see §E P1).
- **COMPETE**: rank now exists per-assessment (this session). No practice-side or cross-assessment competitive framing exists. Recommend treating this as a P2 decision, not a P0/P1 build — needs a product decision on what "compete" even means here (per-assessment rank is honest and already shipped; a global leaderboard is a materially bigger, more sensitive feature — visible ranking of students against each other outside a proctored exam context — that deserves its own explicit go/no-go, not a default build).
- **ASSESSMENTS**: exists, serious, timer-driven, already reviewed and improved multiple times this session (discovery split, review-before-submit). No changes recommended beyond the nav-entry addition in §D.

---

## D. Information Architecture

### D.1 Student — recommended

| Nav item | Status | Change |
|---|---|---|
| Home | exists | keep as-is (continue-card + progress + recent activity); consider trimming the assessments list here to "the next 1-2" once a dedicated Assessments page exists |
| Practice | exists | keep as-is |
| **Assessments** (new) | backend fully supports it (`GET /assessments/assigned` already returns everything needed) | add as its own nav item — currently only reachable by scrolling Home. This is the fastest, lowest-risk IA change in this plan (no backend work, reuse `StudentAssignedListItem`/`AssessmentRow` verbatim) |
| Progress | partially exists (folded into Home + Practice landing) | **not recommended as a separate page yet** — the data already lives on two pages; a third page showing the same numbers a third way would violate the mission's "don't duplicate page structures" rule. Revisit only if Learn ships and needs its own progress view |
| Learn | does not exist | only if approved, see §E P2 — do not add a nav item before there's a real page behind it |
| Profile/settings | does not exist | not recommended — nothing in the current data model needs student-editable settings beyond auth (no notification prefs, no theme choice today); low value for the effort |

### D.2 Admin — recommended

| Nav item | Status | Change |
|---|---|---|
| Command Center (labelled "Assessments" today — see B.3.3) | exists | fix the topbar label mismatch (§E P0, trivial) |
| Question Bank | exists | keep |
| AI Generator | exists | keep |
| AI Review Queue | exists (filtered Question Bank view) | keep the entry point; fix the review *panel* itself (§E P0) |
| **Users** (new) | backend ~60% there (list+create exist, update doesn't) | add only after `PATCH /users/:id` exists (§F); scope as search + role/department/batch filter + deactivate + edit department/batch, reusing `EmptyState`/`SkeletonTable`/`StatCard` verbatim |
| Results | exists only as a per-assessment sub-page (`/admin/assessments/:id/results`), no top-level nav entry | low priority — an admin reaches results from the assessment they care about, which is arguably the right mental model already; not recommending a nav promotion without a concrete pain point |

### D.3 Explicitly not recommended right now

- No "Compete"/leaderboard nav item until §C.2's product decision is made.
- No "Learn" nav item until one vertical slice actually exists.
- No merging AI Generator + AI Review Queue into a single "AI Studio" page — they're different-shaped tasks (generate vs. audit-and-approve) and merging them risks recreating exactly the "too many things on one page" problem the Assessment Builder's stepper was built to avoid.

---

## E. Product Transformation Roadmap

### P0 — fixes dead ends and drift found this session (small, high-leverage, no new schema)

1. **Add a real completion moment to Practice** (§B.3.1). On a `SUBMIT` reaching `ACCEPTED`, show a distinct success state with "Next unsolved problem" (reuse the explorer's `recommended` sort logic — already deterministic, already shipped) and "Back to Practice" CTAs. Apply the same treatment to the exam's per-question `ACCEPTED` state where it doesn't already exist, if any gap is found there during implementation.
2. **Give students a dedicated Assessments nav entry** (§D.1) — zero backend work, a new thin page reusing `AssessmentRow`/grouping logic already built into `StudentHomePage`.
3. **Fix the Admin topbar/title mismatch** (§B.3.3) — either rename the nav item to "Command Center" or make the topbar prefer the page's own `<h1>` text; small, real cohesion fix.
4. **Redesign `QuestionReviewPanel`** to feel like the deliberate final step of a workflow (matching the AI Generator's new visual language) rather than a bare CRUD form — status-forward layout, clearer primary action (Approve) vs. secondary actions, and an explicit "what happens next" line ("this question can now be attached to any assessment") on approval.

### P1 — closes real, backend-confirmed gaps

5. **`PATCH /users/:id`** (department/batch/role/active-status updates) — the one backend gap blocking a real Users page.
6. **Admin Users page** (§D.2) — search, filter by role/department/batch, edit, deactivate. No new schema needed beyond item 5.
7. **A real, transparent "weak area" rule** for Home/Practice (mission §6/§9: never fabricate, but a real rule is fair game) — e.g. "topics with ≥2 problems and 0 solved," surfaced only when the rule's own condition is met, with the rule itself documented next to the code the way `resolveContinueAction` already documents its own priority order.
8. **Results roster visual pass** — same treatment Question Bank got this session (the roster is the last remaining bare `<table>+filter row` on a page that already has real, rankable data to show more meaningfully, e.g. sortable by rank).

### P2 — larger, decision-gated scope (do not start without an explicit go-ahead)

9. **Learn pillar — one vertical slice only** (§C.2, §F) — requires new schema, a new admin content-authoring surface, and a new student-facing page. Explicitly scoped to one topic end-to-end, not a content-generation sprint.
10. **Compete / cross-assessment leaderboard decision** (§C.2) — a product and privacy decision (is student-vs-student visible ranking desired outside a proctored context?) before any build.
11. **Responsive pass** for browsing surfaces (Question Bank, Practice Explorer, Results, Home) — the shell/sidebar already collapses correctly on narrow viewports (confirmed: a working hamburger + slide-out pattern already exists in `shell.css`); what's unverified is every table/filter-row's own narrow-width behavior.
12. **Accessibility pass** — `Modal` already has a real focus trap; extend the same rigor to exam/practice toolbars and filter rows (tokens already define `--focus-ring`; audit is whether every interactive element actually uses it).
13. **Google OAuth architecture prep only** (mission §18) — no credentials exist in this environment; do not claim OAuth works. If pursued, scope as a new `IdentityProvider` implementation alongside the existing local one (the codebase's own design already anticipates this — see `docs/integration.md`), not a replacement.
14. **Test-database isolation implementation** (the investigation is done; §A.4) — only if you want it actually fixed now, per the smallest-footprint approach already proposed (a second local Postgres DB + `NODE_ENV`-based env-file selection in `ConfigModule`).

---

## F. Data Model Requirements

Only two real additions are needed for anything in P0/P1:

- **None for P0.** Every P0 item is presentational/UX or reuses existing endpoints.
- **P1 item 5** needs an `UpdateUserSchema` (Zod) + `PATCH /users/:id` handler in `UsersService`/`UsersController` — updating `department`, `batch`, `role`, `isActive` on an existing `User` row. No new column needed; every field already exists on `User`.
- **P2 item 9 (Learn), if approved**, needs new models — sketched here only as a starting point, not a final design:
  - `Topic` (id, name, description, orderIndex) — a real curriculum entity, distinct from `Question.topics`' free-text tags.
  - `Concept` (id, topicId, title, body, orderIndex) — the actual lesson content.
  - A join surfacing which `Question`s belong to a `Concept`'s practice set — likely reusing the existing `topics: String[]` tag match rather than a new join table, to avoid a second source of truth for topic membership.
- **P2 item 10 (Compete), if approved**, needs a decision-dependent aggregation — likely a new read-only query (not a new table) over existing `Result` rows grouped across assessments, unless "compete" is scoped to include practice performance too, in which case it also touches `Submission`.

---

## G. Backend Requirements

- P0: none beyond what P0 items themselves imply (all UI/data-shape work against existing endpoints).
- P1 item 5/6: `PATCH /users/:id` (see §F), plus extending `ListUsersQuerySchema` with `search`/`department`/`batch` params (small, same shape as `ListQuestionsQuerySchema`'s existing pattern).
- P1 item 7: a pure-frontend deterministic rule reading data already returned by `PracticeService.getProgress`'s `byTopic` — no backend change needed.
- P2 item 9: new Nest module (`content` or `learn`), new Prisma models + migration, new admin CRUD endpoints, new student read endpoints.
- P2 item 10: one new aggregation query, exposed via a new endpoint once the product decision is made.
- P2 item 14: `ConfigModule.forRoot` env-file selection change + a new `.env.test` (already covered by the existing `.env*` gitignore pattern).

---

## H. Frontend Experience Plan (page by page)

| Page | Plan |
|---|---|
| `PracticeWorkspacePage.tsx` / `ExecutionResultPanel.tsx` | P0-1: add a success state + Next/Back CTAs on `ACCEPTED` submit |
| New `StudentAssessmentsPage.tsx` | P0-2: thin page, reuse `AssessmentRow` + grouping from `StudentHomePage.tsx` |
| `AppShell.tsx` | P0-3: fix title-resolution logic |
| `QuestionReviewPanel.tsx` | P0-4: visual redesign, same data/actions |
| New `AdminUsersPage.tsx` | P1-6: list/search/filter/edit, `StatCard` + `SkeletonTable` + `EmptyState` reused verbatim |
| `StudentHomePage.tsx` / `PracticeLandingPage.tsx` | P1-7: add the weak-area callout, sourced from existing `byTopic` data |
| `AdminResultsPage.tsx` | P1-8: visual pass, optional sort-by-rank |
| New Learn pages (if approved) | P2-9: one topic page, one concept page, links into the existing Practice Explorer via `?topic=` (pattern already proven working) |

---

## I. Risks

- **Learn (P2-9) is the one item in this plan large enough to threaten scope discipline.** Mission explicitly warns against "50 fake topic cards" — the risk is real and the mitigation (one vertical slice, explicit approval gate) is already built into the roadmap ordering.
- **Compete (P2-10) is a privacy/product-sensitivity risk, not just an engineering one** — visible student-vs-student ranking outside a proctored exam context is a different trust posture than the current per-assessment rank (already gated behind "the assessment window has closed," matching exam integrity norms). Needs an explicit decision, not a default build.
- **The Users PATCH endpoint (P1-5) touches `isActive`/`role`** — both are security-relevant fields (an admin deactivating or reassigning a role). Needs the same "deny by default" RBAC discipline already used everywhere else in this codebase, and should not allow an admin to demote/deactivate themselves into a locked-out state without a safeguard.
- **Responsive/accessibility passes (P2-11/12) are broad by nature** — recommend scoping each to the specific pages named in §E rather than a blanket "audit everything," to keep them reviewable in vertical slices per the existing working method.
- **None of the P0/P1 items require touching the execution service, authentication, or deployment architecture** — lowest-risk category of this whole plan, consistent with "preserve what already works."

---

## J. Acceptance Criteria

- **P0-1**: solving a practice problem (`SUBMIT` → `ACCEPTED`) shows a distinct completion UI with a working "next problem" link that lands on a real, different, unsolved problem — verified live, not just typechecked.
- **P0-2**: a student can reach their assessment list from the sidebar in one click, showing the same real groups (In progress/Available/Awaiting results/Upcoming/Completed) already on Home.
- **P0-3**: the browser tab/topbar title matches the page's own heading on `/admin`.
- **P0-4**: `QuestionReviewPanel` no longer reads as a bare CRUD form when placed next to the AI Generator's staged flow — same functionality, different visual treatment, verified by opening a real pending-review question.
- **P1-5/6**: an admin can search for a real student by name/email/department/batch, edit their department/batch, and deactivate/reactivate their account — all changes persist and are enforced server-side (a deactivated user cannot log in).
- **P1-7**: the weak-area callout only ever appears when its documented real rule is satisfied for the real logged-in student, and never shows for a student with insufficient data (verified against at least one real account with data and one with none).
- **P1-8**: the results roster is sortable and visually distinguishable from the Question Bank/Practice Explorer tables, not just re-skinned identically.
- **P2 items**: each ships as its own reviewed vertical slice with an explicit "does this feel like a real product" check before being marked done, per the mission's own standard — not bundled together.

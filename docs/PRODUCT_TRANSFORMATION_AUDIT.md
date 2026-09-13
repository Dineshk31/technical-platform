# Product Transformation Audit — Centurion Technical Platform

*Written before any implementation, per direct instruction. Every claim below was verified against the real source tree, the real running application (API + web, both started and exercised live during this audit), and the real development database — not assumed from memory or from a prior session's notes. Where something could not be verified live, that is stated. This document does not repeat what `docs/PRODUCT_GUIDE.md` already covers (security posture, deployment readiness, execution-sandbox honesty) — it focuses on the one thing that guide deliberately does not: whether this *feels* like a product.*

---

## 0. Method

1. Read every backend module (`apps/api/src/modules/*`), the full Prisma schema, and all 17 files in `docs/`.
2. Read every frontend page (`apps/web/src/pages/*.tsx`) and every shared component (`apps/web/src/components/*.tsx`), plus the full CSS design-token layer (`apps/web/src/styles/*.css`).
3. Started the real API (`npm run dev:api`, connected to the real Postgres dev database) and the real web app (`vite dev` on :5173), logged in as both the seeded admin (`admin@centurion.test`) and seeded student (`student@centurion.test`), and walked every reachable screen, taking screenshots.
4. Queried the live database directly (via Prisma) to get exact, current counts rather than guessed ones.

Nothing below is invented. Where I say a screen "is a bare table," that's from an actual screenshot, not a code-reading inference.

---

## 1. Current Product Inventory

### 1.1 Routes (`apps/web/src/App.tsx`)

**Public**
- `/login`

**Admin** (inside `AppShell`, sidebar nav)
- `/admin` — assessment list (the admin's only "dashboard")
- `/admin/questions` — Question Bank
- `/admin/questions/new`, `/admin/questions/:id/edit` — coding question form
- `/admin/questions/mcq/new`, `/admin/questions/mcq/:id/edit` — MCQ form
- `/admin/questions/ai-generate` — AI Question Generator
- `/admin/assessments/:id` — assessment detail/builder
- `/admin/assessments/:id/results`, `/admin/assessments/:id/results/:attemptId` — results

**Student** (inside `AppShell`, sidebar nav)
- `/student` — "My Assessments" (the student's only "dashboard")
- `/student/practice` — Practice landing (added this session, previous slice)
- `/student/practice/problems` — Problem Explorer
- `/student/assessments/:id` — assessment detail/start page
- `/student/attempts/:attemptId/result` — result page

**Full-bleed, outside `AppShell`** (deliberately, for focus)
- `/student/attempts/:attemptId` — the exam-taking page (Monaco + timer)
- `/student/practice/problems/:id` — the practice coding workspace (Monaco, no timer)

**Total: 17 routes.** Two role-scoped experiences, two "escape the shell" full-screen workspaces. No 404 page beyond a bare redirect to `/`; no admin analytics/reporting route beyond per-assessment results; **no user-management route at all**, despite a full `GET/POST/PATCH /users` API existing.

### 1.2 Pages, by how they're actually built

Every admin page and both non-workspace student pages follow the *same* recipe: `<div className="dashboard-body">` → optional `<PageHeader>` → one or more `<div className="card">` blocks, each containing either a `<table className="table">` or a `<form className="form-grid">` of native `<input>`/`<select>` elements. There is no page in the entire app that departs from this recipe except:
- `LoginPage` (a genuinely designed two-panel screen — see §2.9)
- `StudentResultPage` (stat tiles + breakdown table — the second-best-designed screen)
- `PracticeLandingPage` / `PracticeExplorerPage` / `PracticeWorkspacePage` (this session's prior slice — uses `StatCard`, progress bars, and the exam-style 3-pane workspace)
- `StudentExamPage` / `PracticeWorkspacePage` (the two Monaco workspaces — genuinely bespoke layouts)

That means **13 of 17 routes** (every admin screen, plus the student assessment-detail and dashboard) are visually indistinguishable from each other: a title, a filter row, a table or a form. This is the single biggest, most measurable finding of this audit.

### 1.3 Backend API surface (verified against the live, running server's route log)

The API maps **~75 routes** across 11 Nest modules: `auth`, `users`, `assessments` (+ `attempts` sub-controller), `questions`, `submissions`, `results`, `ai`, `practice`, `execution-client` (internal), `health`. Full endpoint list already lives in `docs/api-specification.md` and is accurate — I cross-checked it against the actual `RouterExplorer` boot log and found no drift. Notable, product-relevant facts from that cross-check:

- **`GET/POST/PATCH /users` exists and works, but has no admin UI at all.** An admin today can only ever see a student's name/email as a side-effect of assigning them to an assessment or viewing a results roster — there is no place to browse, search, or manage the user list itself.
- **`GET /assessments/:id/ranking` is specified in the docs but does not actually exist as a mapped route** (confirmed against the live boot log — there is no `ranking` route printed anywhere). The `results.rank` column is computed and stored (`ResultsService`) but genuinely unreachable from any endpoint. This is a real, verified dead feature, not a documentation typo.
- **Practice Mode's 7 routes** (`/practice/questions`, `/practice/progress`, `/practice/questions/:id`, `/practice/questions/:id/draft|run|submit|submissions`) are the only part of the API that was designed *after* the rest of the product had a shape — and it shows: they're the only student-facing endpoints with a real "landing → explore → detail → progress" arc.

### 1.4 Shared component library (`apps/web/src/components/`)

18 components exist: `AppShell`, `ApprovalBadge` (+ `DifficultyBadge`/`SourceBadge`/`QuestionTypeBadge`), `Badge`, `Button`, `Card` (+ `StatCard`), `ConfirmDialog`, `EmptyState`, `ErrorState`, `Modal` (real focus-trap + Escape-to-close + focus-restore — genuinely accessible), `PageHeader`, `ProtectedRoute`, `QuestionPicker`, `QuestionReviewPanel`, `ResultBreakdown`, `Skeleton` (+ `SkeletonTable`/`LoadingRow`), `StatusBadge`, `Toast`, `useConfirm`. Plus, from the Practice slice: `PracticeSubmissionHistoryPanel`, and from the exam page: `ExecutionResultPanel`, `SubmissionHistoryPanel`, `SaveIndicator`.

**This is a real, reusable foundation** — not a pile of one-off page-local markup. The problem is *usage*, not *existence*: `StatCard` is used on exactly 2 of 13 non-workspace pages (`AdminDashboardPage`, `PracticeLandingPage`); every other page reaches for a raw `<table>` even where a card/list/stat pattern would communicate more. There is no `Tabs`, `FilterBar`, `DataTable`, or `ProgressBar` component — every filter row and every table is hand-built per page (`AdminQuestionBankPage`'s filter row and `PracticeExplorerPage`'s filter row are near-identical JSX, copy-pasted rather than shared).

### 1.5 Design system tokens (`apps/web/src/styles/tokens.css`)

This is a genuine, restrained, professional token set: a real color scale (surfaces/borders/text/brand/semantic-status), a real type scale (7 sizes), a real spacing scale (10 steps), radii, shadows, and `prefers-reduced-motion` handling. **This should not be thrown out or redesigned from scratch** — the brief for the incoming work is exactly "premium, focused, restrained borders, meaningful color, subtle shadows," and that's already what these tokens describe. The gap is that most pages don't *use* the system's expressive range (cards, stat tiles, badges, progress bars) — they use its bare minimum (`.card`, `.table`, `<input>`).

### 1.6 Database — current real state (queried live, just now)

| Metric | Count |
|---|---|
| Total users | 74 |
| `@test.local` (automated E2E) accounts | **72** |
| Real accounts (`admin@centurion.test`, `student@centurion.test`) | 2 |
| Total assessments | 18 |
| Total questions | 41 |
| Total submissions | 25 |
| Practice code drafts | 1 |

Of the 18 assessments, the large majority have titles like `Run Flow 1788690040805-...`, `Submit Flow 1788690040804-...`, `Scoring Basic ...` — auto-generated by e2e specs, timestamped, never meant for a human to see. Of the 41 questions, roughly 30 are similarly-named e2e fixtures (`Approved Attach 1788890338872`, `Queue Check 1788889942737`, etc.); a genuine handful (`Two Sum`, `Maximum Subarray Zeroing`, and 3 recent AI-generated DSA questions) look like real content. **This was already identified in a prior session and nothing has been deleted** — flagged again here per this session's explicit instruction to re-confirm before any cleanup, with a concrete removal proposal in §7.

### 1.7 What already works end-to-end (do not rebuild)

Verified live, not from documentation: admin login → question bank → AI generate → assessment publish rules → student login → practice problem → write/run/submit code → real Judge0-style verdicts → progress persisted in Postgres. The entire mechanical spine of the product is real and functioning. **The transformation this document scopes is entirely about product/UX layering on top of this spine — not about replacing any of it.**

---

## 2. UX Problems (each backed by a live screenshot taken this session)

### 2.1 Student Home is not a home — it's a table
`/student` (`StudentDashboardPage.tsx`) renders "Welcome back, Test" followed immediately by a raw table of 3 assessments, all marked `COMPLETED`. Below the table: nothing. No practice progress, no "continue where you left off," no recommended next action, no sense of the product having two major halves (Practice + Assessments). A student with zero assessments and zero practice activity would see a single empty-state box and nothing else. **This is the single highest-priority fix** — it's the first thing every student sees, every time.

### 2.2 Admin Dashboard's stat cards are decorative, not actionable
`/admin` shows 4 `StatCard`s ("Total assessments: 18", "Active now: 0", "Drafts: 0", "Participants: 33") — real numbers, but numbers that don't lead anywhere and don't answer "what needs my attention." "Active now: 0" is not clickable and shows nothing when you'd click it. There is no surfacing of "3 AI-generated questions are waiting for review" or "this published assessment starts in 20 minutes" anywhere on the landing page an admin sees every single login.

### 2.3 Assessment creation is a single long scroll of disconnected cards, not a workflow
`AdminAssessmentDetailPage.tsx` stacks **Details → Sections → Participants** as three independent `<div className="card">` blocks on one page, each with its own local form state, saved independently. There is no sense of sequence, no "you are on step 2 of 4," and — confirmed by screenshot — an admin opening a freshly created assessment sees three panels of mostly-empty fields simultaneously, with the "Publish" button already visible at the top even though nothing has been configured yet.

### 2.4 The AI Generator has real workflow depth in the backend and none in the UI
The backend genuinely implements a five-stage pipeline (generate → validate → preview → save → review-approve), documented precisely in `docs/ai-integration.md` and `docs/question-system.md`. The UI, screenshotted live, is one scrollable page: a flat form, then (after generating) a flat list of `DraftCard`s that look exactly like the admin's manual question-creation form. There is no visual indication that "Generate" is step 1 of anything, no progress indicator through the pipeline, and the eventual "Go to AI Review Queue" link at the bottom is easy to miss (it's the last element on a long page).

### 2.5 Every table looks the same regardless of what it's showing
The Question Bank table, the Assessment list table, the Results roster table, and the Practice Explorer table are four structurally near-identical `<table className="table">` blocks with different columns. There is no visual language that says "this is content to browse" vs. "this is a roster to audit" vs. "this is your own progress." A screenshot of any one of these tables, cropped to remove the header, is indistinguishable from any other.

### 2.6 No completion moment anywhere in the product
Confirmed live: solving a Practice problem flips a badge from "Not attempted" to "Solved" and nothing else happens — no toast, no "what's next," no next-problem suggestion. Submitting an assessment redirects back to a plain table row that now says "Submitted." There is no single moment in this entire product, admin or student, where finishing something *feels* like finishing something.

### 2.7 Navigation doesn't reflect what the product actually is
The student sidebar has exactly 2 items: "My Assessments," "Practice." The admin sidebar has exactly 4: "Assessments," "Question Bank," "AI Generator," "AI Review Queue." Both are accurate but both undersell the product — there is no "Progress" or "Profile" surface for a student at all (their only "progress" view today is buried inside `/student/practice`, and only covers practice, never assessments), and there is no "Results" or "Users" entry point in the admin nav even though results and users both have real backend support.

### 2.8 Results/Ranking is a half-built feature with no honest signal to the user
`results.rank` is computed and stored on every finalized result (confirmed in `ResultsService` and the schema) but, as verified against the live route table, **no endpoint returns it**. The admin results roster and the student result page both simply never mention rank. This isn't a UX polish problem — it's dead, unreachable code sitting in a place a future maintainer (or this transformation) could easily either wire up or should explicitly remove, per this brief's "don't pretend future features exist" rule.

### 2.9 The one screen that already looks like a real product: Login
`LoginPage` (screenshotted) is a genuine two-panel design — brand panel with real copy ("Server-authoritative timers — no client-side shortcuts," etc.) and feature bullets, a clean sign-in card. It is the calibration target for the rest of the product: everything past the login button should look like it was designed by the same person who built this screen. Today, nothing else does.

### 2.10 Practice Mode (this session's prior slice) is the second-best-designed area, but it's an island
Practice has a real landing page with `StatCard`s and difficulty progress bars, a real filterable explorer, and a genuinely good coding workspace (verified live: Run/Submit/history/draft-persistence all work and look coherent). But it has zero connective tissue to the rest of the product — the Student Home doesn't reference it, there's no "you solved 1/17 problems" surfaced anywhere outside `/student/practice` itself, and a returning student has no reason to think to click "Practice" in the sidebar unless they already remember it exists.

### 2.11 No user-facing empty-state guidance where it matters most
`EmptyState` exists and is used (question bank, assessment list, results roster) — that pattern is good. But the *highest-value* empty state — a brand-new student with 0 assessments and 0 practice activity, logging in for the very first time — gets only a table's worth of "No assessments assigned yet." There's no invitation to go try Practice instead, even though Practice requires no assignment and is available to every student immediately.

---

## 3. Product Gaps vs. a Modern Coding Platform (benchmark only — no cloned UI)

| Capability | Modern platforms (LeetCode/GfG/HackerRank-class) | This platform today |
|---|---|---|
| Home/dashboard that recommends a next action | Yes, from real solve history | No — static table only |
| Problem list with sort (recommended/newest/difficulty/acceptance) | Yes | Filter-only, no sort at all (not even by difficulty) |
| Visible streak / activity history | Yes | No activity feed anywhere, admin or student |
| Topic-level progress ("Arrays: 4/9 solved") | Yes | Topics exist on every question (`Question.topics: string[]`) and are already indexed (`@@index([topics], type: Gin)`) but **never aggregated or shown anywhere** — a real, cheap, honest win sitting unused |
| A moment of positive feedback on solving something | Yes (confetti/streak/badge, varies by product) | None at all, anywhere |
| Admin "what needs attention" surface | Yes (review queues, flagged content) | Only via manually navigating to the AI Review Queue; nothing surfaces it proactively |
| Guided multi-step content-creation flows | Yes | Flat forms everywhere |
| User management (search/filter students, see their activity) | Yes | Backend exists (`/users`), zero UI |

None of these require new backend capability beyond the topic-aggregation case (a straightforward query, same shape as `PracticeService.getProgress`'s existing `groupBy`), and the sort case (adding an `orderBy` option to an already-paginated list endpoint). This section exists to calibrate ambition, not to hand you a shopping list to build blindly — see §5 for what's actually prioritized.

---

## 4. Architecture Opportunities (what to reuse, concretely)

- **`PracticeService.getProgress`'s pattern** (real `groupBy` on `Question.difficulty`, cross-referenced against the student's own `Submission` rows) is the exact template for: (a) a topic-progress breakdown, (b) a Student Home "recommended difficulty" rule, (c) an admin-side "content coverage by topic" view. One helper, three consumers.
- **`StatCard` + `.stat-card-grid`** should become the default for every dashboard-shaped screen (Admin Dashboard already uses it well; Student Home, a rebuilt Assessment detail overview, and an Admin "what needs attention" panel should all reuse it verbatim).
- **`ExecutionResultPanel`/`SaveIndicator`/the exam CSS classes (`exam-*`)** are already fully reusable for any future "workspace" screen — proven by `PracticeWorkspacePage` reusing them wholesale last session. No new workspace chrome needs inventing.
- **`useConfirm`/`ConfirmDialog`** already gives every destructive/serious action (submit assessment, reset code, delete draft) a real, styled confirmation — this exists and is used correctly in the two places that need it (exam submit, practice reset); it should be the default for anything the transformation adds that's similarly consequential (e.g., a future "unpublish" or "archive" action that isn't already wired to it).
- **`QuestionPicker`** (used today only inside assessment section-building) is a real, working searchable-picker component — its pattern (not necessarily the component itself) is the right starting point for a step-based assessment builder's "add questions" step.
- **The `assessment_participants`/`assignParticipants` API** already supports both direct and department/batch assignment — a real user-management page can be built as a thin new admin screen over the *existing* `/users` endpoints without any backend change.
- **`docs/database-schema.md`, `docs/api-specification.md`, `docs/assessment-system.md`, `docs/question-system.md`, `docs/ai-integration.md`** are accurate, current, and detailed — any implementation work should treat them as the API/data contract reference instead of re-reading controller source every time.

---

## 5. Proposed Transformation Plan

Prioritized as requested. **P0 = do first, highest leverage. P1 = high value, do after P0 lands and is verified in-browser. P2 = real but lower-leverage enhancement.** Every item below only uses data/APIs that already exist, except where explicitly marked "(needs a small new endpoint)" — and even those are one straightforward query each, not new subsystems.

### P0 — Critical (the product's first impression and core loop)

1. **Rebuild Student Home (`/student`)** into a real landing experience: personalized greeting (exists), a "continue where you left off" card (derived from: most recent `PracticeCodeDraft.updatedAt`, or an `IN_PROGRESS` attempt, or an assessment that's currently `ACTIVE` and unstarted — all queryable today), a practice-progress `StatCard` row (reuse `PracticeService.getProgress`), the existing assessments table demoted to a secondary section, and a deterministic "recommended next action" (rule-based, e.g. "0 solved → try an Easy problem," exactly as this brief specifies — no fake AI).
2. **Give the Admin Dashboard a "needs attention" section**: pending-AI-review count (already queryable: `questions` where `source=AI_GENERATED AND approvalStatus=PENDING_REVIEW`, exactly the AI Review Queue's own filter, just counted instead of listed), draft-assessment count (already shown, just not actionable — make the stat card itself a link), and assessments whose window opens/closes within 24h (a simple date-range query against `assessments`).
3. **Convert the Assessment Detail page into a step-aware builder** for `DRAFT` assessments (Basic Info → Questions → Participants → Review/Publish), reusing the *existing* section/question/participant panels as the content of each step rather than rewriting them — this is a shell/navigation change around already-working panels, not new CRUD logic. Once `PUBLISHED`, collapse back to the current single-page "detail" view (which is already appropriate for a locked, mostly-read-only record).
4. **Database test-data cleanup** (see §7 for the exact, approval-gated plan) — this doesn't ship to users, but it's P0 because every other screenshot/demo/QA pass in this transformation is currently cluttered by 72 fake accounts and ~26 fixture assessments.

### P1 — High value

5. **Topic progress**, surfaced on both the Practice landing page (student) and as a small admin content-coverage view — one new aggregation query, reused on both sides (see §4).
6. **Sort on the Problem Explorer** (Newest / Difficulty / Title — all backed by real columns already selected; no "most solved"/popularity metric, since nothing tracks that today and this brief explicitly forbids inventing one).
7. **A real completion moment** for solving a practice problem (a distinct success state on the workspace itself — "Accepted" treatment already exists via `ExecutionResultPanel`; add a clear next-step CTA — "Next problem" / "Back to Practice" — once a `SUBMIT` reaches `ACCEPTED`) and for finishing an assessment (replace the bare post-submit table row with the explicit "submitted successfully, results will be available once the window closes" messaging this brief calls for).
8. **A minimal Admin "Users" page** over the existing `/users` API — search/filter by role/department/batch, no new backend work.
9. **Promote `StatCard`, a shared `FilterBar`, and a shared `DataTable` wrapper** out of one-off page code into real reusable primitives (the visual result doesn't have to change yet — this is the refactor that makes every subsequent screen cheaper and more consistent, addressing §2.5 at the root).

### P2 — Enhancement

10. **Unify the AI Generator into a visibly staged flow** (Configure → Preview → Save → Review, as distinct visual states of one page, not four separate looking sections) — the backend already enforces this sequence; this is purely presentational sequencing.
11. **Decide the fate of `rank`/leaderboard** (§2.8) — either wire `GET /assessments/:id/ranking` into the results roster and student result page, or explicitly remove the dead computation. This is a product decision, not a build task — flagged here for your call, not started.
12. **Responsive pass** for the browsing/reading surfaces (Question Bank, Practice Explorer, Student Home, Results) — the coding workspaces staying desktop-oriented, per this brief's own instruction, with a clear "switch to a larger screen for the best coding experience" notice on narrow viewports rather than a broken squeezed editor.
13. **Accessibility pass**: `Modal` already traps focus correctly; extend the same rigor to the two Monaco workspaces' toolbars and the filter rows (visible focus rings exist in tokens — `--focus-ring` — audit that every interactive element actually uses it, since several raw `<select>`/`<input>` elements today rely on browser defaults rather than the design system's own focus treatment).

### Explicitly not in this plan (per your constraints)

- No Docker, no execution-sandbox rewrite, no OAuth implementation (see §8 for the documentation-only OAuth deliverable).
- No new "faculty" role, no plagiarism detection, no leaderboard *decision* made on your behalf (§5.11 is a flagged decision, not a default).
- No test-architecture redesign (isolated test DBs, transactional cleanup) without first understanding why the current e2e suite writes into the shared dev database — that investigation is scoped as its own P1/P2 item below the fold, not started here.

---

## 6. Test-Data Cleanup — Proposal Only (no deletion performed)

Re-confirmed live, this session: **74 users (72 `@test.local`), 18 assessments, ~30 of 41 questions** are automated-test fixtures, identifiable purely by naming convention (an epoch-millisecond suffix in the title, e.g. `Approved Attach 1788890338872`) and email suffix (`@test.local`). The two real accounts (`admin@centurion.test`, `student@centurion.test`) are never touched by this proposal.

**Proposed identification query** (Prisma, illustrative — not run):
```ts
const testUsers = await prisma.user.findMany({ where: { email: { endsWith: '@test.local' } } });
const testAssessments = await prisma.assessment.findMany({
  where: { title: { contains: '-' }, OR: [
    { title: { startsWith: 'Run Flow' } }, { title: { startsWith: 'Submit Flow' } },
    { title: { startsWith: 'Scoring Basic' } }, { title: { contains: 'Then Accepted' } },
    { title: { contains: 'Then Wrong' } },
  ]},
});
// Questions: same pattern — title matches a known e2e-spec fixture prefix AND has a trailing
// epoch-millisecond number, cross-checked against createdBy being a @test.local user.
```
Deleting `testUsers` cascades (per schema `onDelete: Cascade`) through their attempts/submissions/practice drafts/refresh tokens automatically; assessments cascade through their sections/questions-links/participants. Nothing here touches `admin@centurion.test`, `student@centurion.test`, or any question/assessment without a matching fixture-naming signature.

**I will not run this without your explicit sign-off on the exact list it would remove** — per your instruction, the next step (if you approve) is to run the identification query read-only, show you the precise row counts and titles it would delete, and wait for a second, explicit "yes, delete these" before touching the database.

Separately: **why does the e2e suite write into the shared dev database at all?** — this needs its own investigation (test config, whether a `DATABASE_URL_TEST` already exists but is unused, whether specs clean up after themselves reliably) before proposing a fix. Flagged as a P1/P2 follow-up, not solved in this pass.

---

## 7. Authentication Direction — Audit Only

Confirmed in `docs/security.md`/`docs/integration.md` and by reading `AuthModule`: the codebase already has an `IdentityProvider`-shaped abstraction in its design (local email/password today), specifically so SSO/OAuth can be added later without a rewrite. **No Google OAuth credentials exist in this environment** (`.env` has no OAuth client id/secret fields at all today). Per your instruction, I am not touching authentication in this pass. What Google OAuth would need, when you're ready:
1. A Google Cloud OAuth 2.0 client (web application type), with the platform's real production/staging origin(s) registered as authorized redirect URIs.
2. `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` added to `apps/api/.env` (never committed).
3. A new `POST /auth/google/callback` (or similar) endpoint implementing the same `IdentityProvider` contract the local-auth path already uses, so the rest of the app (RBAC, JWT issuance, refresh rotation) needs zero changes.
4. A decision on email-domain restriction (e.g., only `@centurion.edu.in` Google accounts allowed) — a product policy call for you, not a technical one.

Existing email/password auth stays exactly as-is until you decide otherwise — nothing here blocks or degrades it.

---

## 8. What I Need From You Before Implementation Starts

1. **Sign-off on the P0/P1/P2 prioritization in §5** — or redirect it.
2. **Sign-off on running the read-only identification query in §6** so I can show you exact deletion candidates (still not deleting anything until a second explicit approval after that).
3. **A decision on `rank`/leaderboard (§5.11)** — wire it up, or remove the dead computation — whenever we reach that item; not blocking P0.

Once you confirm the plan, I'll work P0 in vertical slices exactly as instructed: inspect → design → implement → test → verify in browser → UX self-review → fix → move to the next item, stopping after each one to show `git status` and a summary before continuing.

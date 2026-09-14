# Phase 17 — Product Experience Audit

*Read-only audit. No application code was changed to produce this document. Method: read every route in `apps/web/src/App.tsx` and `AppShell.tsx`, the full `schema.prisma` (759 lines), every backend module directory, and the two prior transformation audits (`docs/PRODUCT_TRANSFORMATION_AUDIT.md`, `docs/FINAL_PRODUCT_TRANSFORMATION_PLAN.md`) and the Phase 16 Learn audit/completion report — all already committed to `main`, confirming P0/P1 (users, weak areas, practice completion, results sort) and the full Learn pillar (lessons, topics, progress) genuinely shipped, not just planned. Then started the real stack (API on :4000, web on :5173 — the web dev server and execution-service were already running from another session on this machine and were reused rather than restarted; a fresh API process was started for this session) against the real Postgres dev database, logged in as both seeded accounts (`admin@centurion.test`, `student@centurion.test`), and walked every reachable screen, taking screenshots and cross-checking several claims directly against source (e.g. whether a stat card is actually a link, whether a "Create user" control actually exists). Where a screen was not re-opened live this session (no `DRAFT` assessment or `ACTIVE` exam currently exists in the data, and none was created to avoid polluting real records), that is stated explicitly and the claim is instead backed by reading the component source plus the prior sessions' own live verification.*

---

## 0. What already shipped (do not re-plan this)

Two full transformation passes already landed on `main` before this phase started (see recent commit log: `9f775a5 feat: complete P0 and P1 product transformation`, `0f8b41a feat: add Learn platform with lessons and progress tracking`). Confirmed still true, live, this session:

- Student Home has a real deterministic "continue" card (assessment > recency-compared Practice/Learn > first-time nudge), real practice-progress stat tiles, and grouped assessment sections.
- A dedicated student **Learn** pillar exists end-to-end: topic grid → topic page → lesson page, with a genuine completion moment (green banner, "Next lesson" / "Practice this topic" / "Back to topic" CTAs) — verified live this session by opening a real, already-completed lesson.
- Practice Mode (landing → explorer with sort/filter/search → Monaco workspace) is real and works, including a completion banner with a deterministic "next problem" recommendation.
- The AI Generator is a staged `Configure → Review generated → Saved` flow, verified live.
- A `QuestionReviewPanel` redesign, an Admin Users page (search/filter/edit/deactivate), and a sortable/rank-badged Results roster all shipped per the P0/P1 completion report and were spot-checked against current source this session.
- The database is clean — only the two real seeded accounts exist (74 fixture accounts and ~26 fixture assessments from e2e runs were removed in a prior session; confirmed still true: `Users` page shows exactly 2 rows).

**This audit does not repeat those findings.** It exists to answer, fresh, as of the current code: does the *whole* product now cohere, and what's the next highest-leverage layer of work. Several things below are net-new findings this session found that the prior docs did not (or that regressed/were only partially addressed) — flagged accordingly.

---

## 1. Current Route Inventory

Confirmed directly from `apps/web/src/App.tsx` and the nav arrays in `apps/web/src/components/AppShell.tsx` — nothing here is inferred.

### Student (`AppShell role="STUDENT"`, 4 sidebar items: Home, Learn, Practice, Assessments)

| Route | Page component | In sidebar? |
|---|---|---|
| `/student` | `StudentHomePage` | Home |
| `/student/learn` | `LearnLandingPage` | Learn |
| `/student/learn/:topic` | `LearnTopicPage` | — |
| `/student/learn/:topic/lessons/:id` | `LearnLessonPage` | — |
| `/student/practice` | `PracticeLandingPage` | Practice |
| `/student/practice/problems` | `PracticeExplorerPage` | — |
| `/student/assessments` | `StudentAssessmentsPage` | Assessments |
| `/student/assessments/:id` | `StudentAssessmentDetailPage` | — |
| `/student/attempts/:attemptId/result` | `StudentResultPage` | — |

**Full-bleed, outside `AppShell`** (deliberate, focus-mode layout):
- `/student/attempts/:attemptId` — `StudentExamPage` (Monaco + timer)
- `/student/practice/problems/:id` — `PracticeWorkspacePage` (Monaco, no timer)

### Admin (`AppShell role="ADMIN"`, 6 sidebar items: Command Center, Question Bank, AI Generator, AI Review Queue, Lessons, Users)

| Route | Page component | In sidebar? |
|---|---|---|
| `/admin` | `AdminDashboardPage` (labelled "Command Center") | Command Center |
| `/admin/questions` | `AdminQuestionBankPage` | Question Bank |
| `/admin/questions/new` | `AdminQuestionFormPage` | — |
| `/admin/questions/:id/edit` | `AdminQuestionFormPage` | — |
| `/admin/questions/mcq/new`, `/admin/questions/mcq/:id/edit` | `AdminMcqFormPage` | — |
| `/admin/questions/ai-generate` | `AdminAIGeneratorPage` | AI Generator |
| `/admin/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW` | `AdminQuestionBankPage` (filtered) | AI Review Queue |
| `/admin/lessons` | `AdminLessonsPage` | Lessons |
| `/admin/lessons/new`, `/admin/lessons/:id/edit` | `AdminLessonFormPage` | — |
| `/admin/users` | `AdminUsersPage` | Users |
| `/admin/assessments/:id` | `AdminAssessmentDetailPage` (stepper if `DRAFT`, single view if `PUBLISHED`/locked) | — (reached via Command Center's table) |
| `/admin/assessments/:id/results` | `AdminResultsPage` | — |
| `/admin/assessments/:id/results/:attemptId` | `AdminResultDetailPage` | — |

**Total: 24 distinct routes** (9 student + 2 full-bleed + 13 admin), across 22 page components. `path="*"` still redirects to `/` — there is still no dedicated 404 page, and no Profile/settings route for either role.

**Backend**: 12 modules (`ai`, `assessments`, `auth`, `execution-client`, `health`, `learn`, `practice`, `questions`, `results`, `scoring`, `submissions`, `users`) — `learn` and `scoring` are the two modules added since the last full audit.

**Database**: 25 Prisma models, unchanged since Phase 16 except the additive `Lesson`/`LessonProgress` pair. Confirmed live: `Question.topics` is validated against a **closed, 20-item** `CODING_TOPICS` enum (`packages/shared/src/enums/question.enum.ts`) plus an 8-item `MCQ_TOPICS` enum — this is the load-bearing vocabulary for Practice filtering, weak-areas, and now Learn's topic grouping.

---

## 2. Page Quality Score

Scored 0–10 on hierarchy, clarity, usefulness, discoverability, nav, next-action clarity, empty/loading state, responsiveness, accessibility. Screens marked **(live)** were opened and screenshotted this session; **(source)** means the score is based on reading the component plus a prior session's own live verification (no fresh screenshot this session, to avoid mutating real assessment/attempt data).

| Page | Score | Main problem | Recommended improvement |
|---|---:|---|---|
| Login **(live)** | 9 | None significant — this remains the calibration target | — |
| Student Home **(live)** | 8 | Assessments list is duplicated verbatim on Home and on the new Assessments page (never trimmed once the dedicated page shipped) | Trim Home's assessment section to 1–2 items + "View all" |
| Learn Landing **(live)** | 6 | A student who reaches 100% completion (real case, verified: this student is at 4/4) sees no "you've finished everything currently published" message — looks identical to a partially-done state | Add an honest "you're caught up" state distinct from mid-progress |
| Learn Topic **(live)** | 7 | Fine as-is | — |
| Learn Lesson **(live)** | 8 | Best completion moment in the product — genuinely good | — |
| Practice Landing **(live)** | 8 | Fine as-is | — |
| Practice Explorer **(live)** | 6 | On narrow viewports the *entire page* scrolls horizontally instead of just the table (verified: title and filter card scroll off-screen together with the table) — the `.table-wrap{overflow-x:auto}` wrapper exists but something upstream in the layout still lets the page itself overflow | Contain horizontal overflow to the table only; audit `.dashboard-body`/filter-row widths |
| Practice Workspace **(source, prior session verified)** | 8 | None new found | — |
| Assessments (student) **(live)** | 6 | A thin, correctly-grouped list, but with only status grouping — no visual distinction from a generic list | Low priority — functional and honest |
| Assessment Detail (student) **(source)** | 6 | Simple, functional; not independently re-verified live this session | — |
| Exam **(source, prior sessions verified)** | 8 | No `ACTIVE` assessment exists in current data to re-open live this session | — |
| Result (student) **(live)** | 8 | Reached via "Back to your assessments" but the topbar reads "Home" (nav-prefix-match quirk, `/student/attempts/.../result` starts with `/student`) — small "where am I" inconsistency | Give this route its own topbar title resolution |
| Command Center **(live)** | 6 | Half the "needs attention" stat cards are inert — confirmed in source: `Active now`, `Upcoming`, `Participants assigned` StatCards have no `to` prop at all, unlike `Total`/`Approved`/`Pending AI review`, which are links. The page still ends in a bare assessments table below the stat cards | Make every stat card that has an obvious destination a real link; the mix of clickable/non-clickable cards with identical visual treatment is a real, confirmable inconsistency, not a matter of taste |
| Question Bank **(live)** | 6 | Same title+filter+table recipe as before; table's rightmost columns are clipped at the card edge with no visible affordance that more columns exist until you scroll | Add a visible scroll cue or reduce default columns |
| Question Editor — coding **(source)** | 5 | 495-line flat form, unchanged since the last audit despite the AI Generator (conceptually similar ground) now being staged | Not urgent — admins fill this out rarely, once per question |
| Question Editor — MCQ **(source)** | 5 | 324-line flat form, same shape | Same as above |
| AI Generator **(live)** | 7 | Fine — the staged flow works and is visually distinct from the flat forms | — |
| AI Review Queue **(live)** | 6 | Honest, contextual empty state ("Nothing to review") — genuinely good; the queue itself is just the Question Bank table pre-filtered | — |
| QuestionReviewPanel (opened from a question row) **(source)** | 6 | Redesigned per the P0/P1 report; not re-opened live this session (would require finding or creating a `PENDING_REVIEW` question) | — |
| Lessons (admin) **(live)** | 5 | Same bare table+filter recipe; **gives the admin no signal about content coverage** — 18 of 20 coding topics and all 8 MCQ topics have zero lessons, and nothing on this page says so | Surface a "topics with no lessons yet" count or list |
| Lesson Editor (admin) **(source)** | 5 | Not opened live this session; 211 lines, likely a smaller flat form matching the question editors' shape | — |
| Assessment Builder — `DRAFT` **(source, prior sessions verified; confirmed via source that the 4-step `Stepper` component is still wired in for `isDraft`)** | 7 | No `DRAFT` assessment exists in current data to re-open live | — |
| Assessment Detail — `PUBLISHED`/locked **(live)** | 5 | Confirmed live: still three stacked `<div className="card">` blocks (Details / Sections / Participants) — functionally correct, visually flat, unchanged from the original audit's finding | Lower priority — a rarely-revisited, mostly-read screen |
| Results roster (admin) **(source)** | 6 | Rank pills + sort confirmed in source (`RankCell`, trophy/medal icons, `SORT_OPTIONS`); not re-opened live (no results-eligible assessment browsed this session beyond the student's own view) | — |
| Result Detail (admin) **(source)** | 5 | Small (90 lines), not opened live | — |
| Users (admin) **(live)** | 6 | Functional — search/filter/edit/deactivate confirmed live. **Confirmed in source: there is no "Create user" control anywhere on this page** — `grep` for `Create`/`New user`/`Add user` in `AdminUsersPage.tsx` returns nothing, despite `POST /users` existing and working on the backend | Add a "Create user" action — see §3 finding 1, this is the single most concrete new gap this audit found |

**Average: 6.5/10.** The product is materially more cohesive than the original audit's finding of "13 of 17 routes visually indistinguishable" — Learn, Practice, and the AI Generator are genuinely differentiated experiences now. What's left is a smaller, more specific list: a handful of confirmable dead controls, one responsive bug, a content-coverage blind spot, and the account-provisioning gap below.

---

## 3. Dead-End Audit

Each entry is a verified state, not a hypothetical.

### 1. No way to create a user account anywhere in the UI
**CURRENT STATE**: `AdminUsersPage.tsx` has search, filter, edit (role/department/batch/active), and deactivate — confirmed live. It has no create action. `POST /users` exists and works on the backend (confirmed in `users.controller.ts`), and the assessment builder's "assign by department/batch" (`AdminAssessmentDetailPage.tsx:665-667`) can bulk-assign *existing* users to an assessment — but there is no path in the product for those users to have come to exist in the first place, beyond the two seeded accounts.
**USER PROBLEM**: An admin who wants to onboard a real cohort of students has no in-product way to do it. Today that requires direct API calls or a DB script — not a real admin workflow.
**RECOMMENDED NEXT ACTION**: A "Create user" button on the Users page (single-user form, reusing the existing edit-modal's fields) is the minimum; a CSV/bulk-import is a larger, separate decision (see plan, P1).

### 2. Learn Landing gives no signal when a student has completed everything currently published
**CURRENT STATE**: Verified live — the seeded student is at 4/4 lessons across the only 2 topics that have content (Arrays, Hashing). The page renders exactly the same layout it would at 2/4 — a topics grid with full progress bars. There is no "you're caught up — new topics will appear here as they're published" message.
**USER PROBLEM**: A returning student who has read everything available sees a page that looks unfinished (only 2 topic cards, no visual signal that this *is* the whole current catalog) rather than a page that confirms "you did it, this is genuinely all there is right now."
**RECOMMENDED NEXT ACTION**: A distinct "all caught up" state, honest about catalog size (e.g. "You've completed every published lesson. 2 of 20 topics have lessons so far.") — never inventing progress, just being honest about scope.

### 3. Command Center's stat cards are inconsistently actionable
**CURRENT STATE**: Confirmed in source (`AdminDashboardPage.tsx`): `Total`, `Approved`, `Pending AI review`, `Drafts` all pass a `to` prop and are real links. `Active now`, `Upcoming`, and `Participants assigned` do not — they render with identical visual styling (same `StatCard`, same hover affordance from CSS) but go nowhere when clicked.
**USER PROBLEM**: There is no visual difference between a clickable and a dead stat card, so a click on "Active now" silently does nothing — the admin can't tell, from looking, which cards are real navigation and which are decorative.
**RECOMMENDED NEXT ACTION**: Either give the remaining three cards real destinations (`Active now` → `/admin?status=ACTIVE`, `Upcoming` → `/admin?status=PUBLISHED`, `Participants assigned` → arguably has no single destination and should be visually demoted to a non-interactive stat instead) — a small, mechanical fix.

### 4. Admin Lessons list has no content-coverage signal
**CURRENT STATE**: Verified live — 4 lessons exist, covering 2 of the 20 real coding topics. The Lessons list page shows exactly those 4 rows and nothing else; there is no indication anywhere in the admin UI of the other 18 topics sitting at zero content.
**USER PROBLEM**: An admin deciding what to author next has to already know the full `CODING_TOPICS` list from memory or from reading `packages/shared` — the product doesn't tell them.
**RECOMMENDED NEXT ACTION**: A small "coverage" panel or filter ("18 topics have no lessons yet") — cheap, since the full topic vocabulary is already a closed enum and the lesson-count-per-topic query is the same shape as `PracticeService`'s existing `byTopic` aggregation.

### 5. Practice/Question Bank/Users tables overflow the whole page on narrow viewports
**CURRENT STATE**: Verified live at 375px width on the Practice Explorer — the page title, the filter card, and the table all scroll left together when swiping right, meaning the browser's own body is wider than the viewport, not just the table. A `.table-wrap{overflow-x:auto}` class exists and is applied, but something upstream (unconfirmed exact cause — candidates are the filter row's un-wrapped `<select>` elements or `.dashboard-body`'s lack of an explicit overflow constraint) still lets the whole page grow wider than the screen.
**USER PROBLEM**: On a phone, browsing problems/questions/users requires scrolling the entire page sideways, which also drags the header and filters out of view — a broken, disorienting experience for the "browsing" surfaces the mission explicitly wants to work at least reasonably on mobile.
**RECOMMENDED NEXT ACTION**: A responsive-pass P1 item — isolate and fix the actual overflow source (see §"Responsive Design Pass" in the plan).

### 6. Archiving a completed assessment — behavior not exercised this session
**CURRENT STATE**: `AdminAssessmentDetailPage`'s `PublishedView` (confirmed live, on a real `COMPLETED` assessment) shows an "Archive" button. This session deliberately did not click it, to avoid mutating a real assessment record during a read-only audit.
**USER PROBLEM**: Unknown — not a confirmed dead end, flagged only so a future session verifies what an admin sees immediately after archiving (does the assessment simply vanish from the default list? is there a confirmation/undo?).
**RECOMMENDED NEXT ACTION**: Verify in the implementation phase, not blocking.

### 7. No 404 page
**CURRENT STATE**: Unchanged from the original audit — `path="*"` silently redirects to `/`. A mistyped or stale admin/student URL gives no explanation, just an unexplained jump back to the dashboard.
**USER PROBLEM**: Minor but real — no differentiation between "you're not logged in," "this doesn't exist," and "here's your home page."
**RECOMMENDED NEXT ACTION**: Low-priority P2/P3 — a real 404 state, not a silent redirect.

---

## 4. Product Journey Audit

### Journey A — Brand New Student
`Login → Home → first Learn/Practice action → Lesson → Practice related problem → Solve`

Verified structurally (not with a literal zero-state account, to avoid creating fixture users): `resolveContinueAction()` in `StudentHomePage.tsx` correctly falls back to a "Get started — solve your first problem" tier when `progress.solved === 0` and there's no assessment/practice/learn history — confirmed by reading the waterfall (§C in the prior Final Plan, unchanged, re-read this session). A first-time student would land on Home, see a clear single CTA into Practice, and — if they instead click "Learn" in the sidebar first — would see an honest, correctly-styled `EmptyState` only for topics with zero lessons; the 2 topics that do have content would show real, well-written lessons. **A brand-new student would understand the platform.** The one gap: nothing on Home *introduces* Learn as an option before they've touched anything — the continue-card only ever shows one action, and a first-timer has to already know to check the sidebar. This is minor; the sidebar itself is the correct, always-visible answer to "what else can I do."

### Journey B — Returning Student
`Login → Home → does the platform help them continue?`

**Yes, verified live and by source.** This session's real walkthrough showed "CONTINUE PRACTICING — Maximum Subarray Zeroing" on Home, correctly reflecting that Practice was this student's most recent activity (ahead of Learn, per the documented recency comparison in `resolveContinueAction`). The Phase 16 completion report independently stress-tested the flip-flop between "Continue Practicing" and "Continue Learning" live in a prior session; this session's live snapshot is consistent with that logic still being in place (unchanged source).

### Journey C — Practice Student
`Home → Practice → discovery → workspace → Run → Submit → Accepted`

Verified live through discovery (landing, explorer with real filters/sort) and the lesson-equivalent completion pattern (via the Learn lesson, which reuses the same visual family as practice's `PracticeCompletionPanel` per the P0/P1 report). The actual Run→Submit→Accepted loop on a *live* problem was not re-executed this session (would create new submission rows against a real account) — trusted from the P0/P1 and Phase 16 reports' own live verification, both of which specifically stress-tested this exact loop multiple times. **What happens next is real**: a distinct completion state with a deterministic "next problem" CTA — this was the single biggest dead end in the original audit and is confirmed fixed.

### Journey D — Assessment Student
`Home → Assessments → Assessment → Start → Exam → Submit → Result`

Verified live through Assessments (grouped list) and Result (stat tiles + rank + per-question breakdown, screenshotted this session on a real `AUTO_SUBMITTED` attempt). The Start→Exam→Submit portion was not re-executed live this session (no `ACTIVE` assessment exists in current data, and starting one would create a real attempt) — trusted from the exam page's own established, unchanged, timer-driven design (confirmed present in source: `StudentExamPage.tsx`, 820 lines, `Suspense`-loaded, full-bleed outside `AppShell`). **This does feel like a serious assessment system** — the result page alone, with real rank and a clean per-question table, reads as more rigorous than most of the admin-side CRUD screens.

### Journey E — Admin
`Login → Command Center → identify what needs attention → create/manage questions → review AI content → build assessment → assign students → publish → review results`

Verified live through Command Center, Question Bank, AI Generator, AI Review Queue (honest empty state), Lessons, and Users. **Partial answer**: Command Center *tries* to be a control center (real "needs attention" numbers) but three of its seven stat cards are inert (§3.3), which undercuts the "what needs my attention" promise the page's own subtitle makes ("What needs your attention, right now"). The AI review → assessment-building → publish chain was not walked start-to-finish live this session (would require generating and approving a real AI question, or building a real draft assessment) — trusted from the P0/P1 report's own explicit live walkthrough of exactly this chain. **Does it feel like a real administrative control center?** Closer than before, but the half-dead stat-card row and the missing user-provisioning path (§3.1) are the two concrete things stopping a full "yes."

---

## 5. Cross-Pillar Continuity

### LEARN ↔ PRACTICE
**Strong, verified live.** Every lesson's completion banner has a real "Practice `<topic>` problems" link that correctly deep-links into the Explorer with a working `?topic=` filter (confirmed on the Arrays lesson this session). The topic page also carries its own "Practice `<topic>` problems" button. This connection is genuine, not decorative.

### PRACTICE ↔ ASSESSMENTS
**Weak, and honestly so — there is no real connection to make.** Practice questions and assessment questions are drawn from the same `Question` table, but nothing on either side references the other (a problem solved in Practice doesn't inform anything shown in an Assessment, and vice versa) — this is correct, not a gap: exam integrity requires practice performance to never leak into or influence a graded assessment. No change recommended here.

### ASSESSMENTS ↔ RESULTS
**Strong, verified live.** A completed assessment's row links straight to "View result" (student side) and the roster/rank system (admin side) is real, sortable, and rank-badged per source. No gap found.

### RESULTS ↔ IMPROVEMENT
**Partial.** A student's individual assessment result shows a real per-question breakdown (verified live: "Two Sum — Attempted — 0/10"), which is honest and specific — but there's no link from a missed/failed question on a result page back into Practice to work on that same topic. This is a real, cheap, currently-missing connection: the question's `topics` are already on the `Question` row, so a "Practice more `<topic>` problems" link on the result breakdown is the same one-line pattern already proven on the Learn lesson page.

### LEARN ↔ ASSESSMENTS
**None, correctly.** No lesson references any assessment and no assessment references Learn. This is appropriate — Learn is prep material, Assessments are graded exams; conflating them would be a real product-integrity risk, not an improvement.

---

## Summary

The product has genuinely closed most of the gaps the last two audits identified: Learn exists as a real, well-built vertical slice; Practice has a real completion loop; the AI Generator is staged; Users management exists. What remains is smaller and more mechanical than the original transformation: a handful of confirmable dead controls (stat cards, missing create-user action), one content-coverage blind spot (Learn's 2-of-20-topics reality isn't surfaced to the admin deciding what to write next), one verified responsive bug, and one new cross-pillar connection (Results → Practice) that the existing "Practice this topic" pattern already makes cheap to add. See `docs/PHASE_17_PRODUCT_TRANSFORMATION_PLAN.md` for the prioritized plan.

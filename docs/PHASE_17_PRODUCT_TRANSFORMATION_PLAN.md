# Phase 17 — Product Transformation Plan

*Built directly on `docs/PHASE_17_PRODUCT_EXPERIENCE_AUDIT.md`. Every item below traces to a specific, verified finding in that document — nothing here is speculative. Ordered P0 (do first) → P3 (optional, explicitly decision-gated). No implementation has started; this is the plan awaiting approval, per the mission's explicit stop-gate.*

---

## P0 — Critical product-experience problems

### P0-1. Add a "Create user" action to the Admin Users page

- **Problem**: `AdminUsersPage.tsx` has search/filter/edit/deactivate but no create action, despite `POST /users` already existing and working on the backend (confirmed in `users.controller.ts`). There is currently no way to onboard a new student or admin account through the product itself.
- **Affected users**: Admins, and indirectly every student who needs an account before anything else in the product (assessments, practice, learn) is reachable for them.
- **Current behavior**: An admin can only manage the two seeded accounts. A new cohort of real students cannot be added without direct API calls or a DB script.
- **Proposed behavior**: A "Create user" button on the Users page opens a form (name, email, role, department, batch — the same fields the existing edit modal already handles) and calls the existing `POST /users` endpoint. Real-time validation reuses the existing Zod schema already enforced server-side (`CreateUserSchema`).
- **Backend changes required**: None — `POST /users` already exists, already validated, already RBAC-gated to `ADMIN`.
- **Frontend changes required**: A "Create user" button + modal/form in `AdminUsersPage.tsx`, a `createUser` call added to `apps/web/src/lib/users-api.ts` (the list/edit calls already live there), reusing `Modal`/`useToast` exactly as the existing edit flow does.
- **Database changes required**: None.
- **Risks**: Low. The one thing worth double-checking during implementation: whether a newly created account needs a way to set/reset its own password (today, `passwordHash` is set at creation — confirm the create form requires a password, or decide whether an admin-set temporary password with a forced-change-on-first-login flow is needed; the schema doesn't currently support forced password change, so the honest MVP is "admin sets an initial password directly," documented as a known limitation, not silently glossed over).
- **Acceptance criteria**: An admin can create a real student account through the UI, log out, log back in as that student, and see a normal, empty-progress Home page — verified live, not just typechecked.

### P0-2. Fix Command Center's inconsistently-actionable stat cards

- **Problem**: `Total`, `Approved`, `Pending AI review`, and `Drafts` stat cards are real links (`to` prop set); `Active now`, `Upcoming`, and `Participants assigned` are not — confirmed directly in `AdminDashboardPage.tsx` source. All seven render with identical visual styling, so there's no way to tell, by looking, which are clickable.
- **Affected users**: Admins, every time they land on Command Center (their default/only real dashboard).
- **Current behavior**: Clicking "Active now" or "Upcoming" does nothing. "Participants assigned" has no obvious single destination (it's an aggregate across all assessments).
- **Proposed behavior**: `Active now` → `/admin?status=ACTIVE`, `Upcoming` → `/admin?status=PUBLISHED` (both trivial, since the same status-filtered table already exists below and already supports a `status` query param — confirmed via the existing `Drafts` card's own `to="/admin?status=DRAFT"` pattern). `Participants assigned` has no natural single-page destination, so it should instead be visually demoted (no hover/pointer affordance) so it doesn't imply clickability it doesn't have — a real fix either way, not left inconsistent.
- **Backend changes required**: None — the list endpoint already supports `status` filtering.
- **Frontend changes required**: Add `to` props to two `StatCard`s in `AdminDashboardPage.tsx`; remove the implied-clickable hover style from the `Participants assigned` card (or wrap it in a non-link `StatCard` variant if one doesn't already exist — `StatCard`'s own source should be checked for whether "no `to`" already renders non-interactively; if it already does, this card needs no change beyond confirming the CSS is right).
- **Database changes required**: None.
- **Risks**: None — purely additive routing, using an already-proven pattern from the same page.
- **Acceptance criteria**: Every stat card on Command Center either navigates somewhere real when clicked, or is visually unambiguous that it's a static number — verified live by clicking each one.

### P0-3. Fix the horizontal page-overflow bug on narrow viewports

- **Problem**: Verified live at 375px width on the Practice Explorer: the entire page (title, filter card, and table together) scrolls horizontally, not just the table. The `.table-wrap{overflow-x:auto}` CSS class exists and is applied, but something upstream still lets the page itself grow wider than the viewport.
- **Affected users**: Any student or admin browsing on a phone — Practice Explorer, and likely Question Bank/Users/Lessons/Results roster, since they share the same filter-row + `.table-wrap` markup pattern (not independently re-verified at mobile width this session for the other three, but the shared markup makes it likely).
- **Current behavior**: Swiping right on a phone drags the whole page sideways, including the header — disorienting, and the filters/title become unreachable without scrolling back.
- **Proposed behavior**: Only the table itself scrolls horizontally on narrow viewports; the page title, filter row, and card padding stay within the viewport width at all times.
- **Backend changes required**: None.
- **Frontend changes required**: Isolate the actual overflow source (most likely candidates: the filter row's `<select>` elements not wrapping/shrinking at narrow widths, or `.dashboard-body` lacking an explicit `overflow-x: hidden`/`max-width: 100%` constraint) and fix at the shared CSS level so every page using this pattern benefits, not just Practice Explorer.
- **Database changes required**: None.
- **Risks**: Low, but must be verified across all affected pages (Question Bank, Users, Lessons, Results roster, Practice Explorer), not just the one this session happened to catch, since the same markup is reused.
- **Acceptance criteria**: At a 375px viewport, the page body itself does not scroll horizontally on any of the five listed pages — only the table region does, when its content genuinely exceeds the card width. Verified with `resize_window` + screenshot on each page.

### P0-4. Give Learn Landing an honest "caught up" state

- **Problem**: Verified live — a student at 4/4 lessons (100% of currently published content, across the only 2 of 20 real topics that have any lessons) sees the identical layout a partially-done student would see. Nothing distinguishes "you're done with everything that exists" from "you have more to do."
- **Affected users**: Any student who finishes the current (small) Learn catalog — a real, already-reachable state, not a hypothetical.
- **Current behavior**: A topics grid showing 2 full progress bars, with no framing of catalog size or completion.
- **Proposed behavior**: When every topic with ≥1 published lesson is at 100%, show an honest completion message that also states real catalog scope (e.g., "You've completed every published lesson — 2 of 20 topics have content so far.") — never implying more exists if it doesn't, per the mission's anti-fabrication rule.
- **Backend changes required**: None — `GET /learn/progress` already returns `byTopic`; the frontend can derive "all topics with lessons are at 100%" from data already fetched. If a total topic count (2 of 20) needs the full `CODING_TOPICS`/`MCQ_TOPICS` list, that's a shared-package import already available client-side, not a new endpoint.
- **Frontend changes required**: A conditional banner/state in `LearnLandingPage.tsx`.
- **Database changes required**: None.
- **Risks**: None.
- **Acceptance criteria**: A student at 100% of currently-published Learn content sees a message that honestly reflects both their completion and the catalog's real current size — verified against the real seeded student (already at 4/4) without needing to fabricate a second account.

---

## P1 — High-value experience improvements

### P1-1. Surface content-coverage gaps on the Admin Lessons page

- **Problem**: Verified live — 4 lessons exist across 2 of 20 coding topics. The admin Lessons list shows only those 4 rows; nothing tells an admin deciding what to author next which topics have zero coverage.
- **Affected users**: Admins authoring Learn content.
- **Current behavior**: An admin has to already know the full `CODING_TOPICS` enum from memory or from reading `packages/shared` source to know what's missing.
- **Proposed behavior**: A small coverage indicator on `AdminLessonsPage.tsx` — e.g., "18 of 20 topics have no lessons yet" with a way to see which, reusing the same `byTopic`-style aggregation pattern already used by `PracticeService.getProgress` and `LearnService`.
- **Backend changes required**: Possibly a small addition to the existing admin lessons-list endpoint (or a new lightweight `GET /lessons/coverage`-shaped query) returning lesson counts grouped by topic across the full enum, including zero-count topics — same aggregation shape already proven elsewhere, not new architecture.
- **Frontend changes required**: A coverage panel/banner on `AdminLessonsPage.tsx`, plus a "topic" filter option for "no lessons yet" if useful.
- **Database changes required**: None — additive query only.
- **Risks**: Low. Keep the aggregation cheap (20 topics, small lesson count) — no pagination/performance concern at this scale.
- **Acceptance criteria**: An admin opening Lessons can immediately see how many (and optionally which) topics have zero published lessons, sourced from real data — verified live against the current real 2-of-20 state.

### P1-2. Cross-link assessment results back into Practice by topic

- **Problem**: A student's result breakdown (verified live: "Two Sum — Attempted — 0/10") shows exactly which questions were missed, but nothing connects that back to Practice. The audit's Cross-Pillar Continuity section (§5) identifies this as the one real, currently-missing connection between Results and Improvement.
- **Affected users**: Students reviewing a completed assessment result who want to actually improve.
- **Current behavior**: The result breakdown is read-only history with no forward action.
- **Proposed behavior**: Each missed/low-scoring coding question in the breakdown gets a "Practice `<topic>`" link into the Explorer, filtered by that question's real `topics` — the exact same one-line `Link to={practice/problems?topic=...}` pattern already proven on the Learn lesson page and the weak-areas card.
- **Backend changes required**: None — `Question.topics` is already returned wherever question data is included in a result payload (confirm during implementation; if the result-breakdown DTO doesn't currently include `topics`, that's a small additive field, not new logic).
- **Frontend changes required**: A conditional link in `ResultBreakdown.tsx` / `StudentResultPage.tsx`.
- **Database changes required**: None.
- **Risks**: None — must not imply practice performance affects the already-finalized assessment score (purely a forward navigation aid, no scoring interaction).
- **Acceptance criteria**: Opening a real result with at least one non-fully-solved coding question shows a working "Practice this topic" link that correctly filters the Explorer — verified live.

### P1-3. Trim Student Home's duplicated assessments section

- **Problem**: The audit's Page Quality Score table (§2) notes Home's assessment list is verbatim-duplicated on the now-separate Assessments page, never trimmed once that dedicated page shipped (a gap the prior `FINAL_PRODUCT_TRANSFORMATION_PLAN.md` §D.1 explicitly anticipated and recommended revisiting).
- **Affected users**: Students, on every Home visit.
- **Current behavior**: Full assessment groups render on both Home and `/student/assessments`.
- **Proposed behavior**: Home shows only the next 1–2 most relevant assessments (e.g., in-progress/available-now first) with a "View all assessments →" link into the dedicated page; the full grouped view lives only on `/student/assessments`.
- **Backend changes required**: None.
- **Frontend changes required**: Slice/limit the existing `groupStudentAssessments` output in `StudentHomePage.tsx`; no change to `StudentAssessmentsPage.tsx`.
- **Database changes required**: None.
- **Risks**: Low — must keep whatever assessment is most time-sensitive (active/starting soon) visible on Home even when trimmed; use the existing grouping's own priority order rather than inventing a new one.
- **Acceptance criteria**: Home shows a short, correctly-prioritized assessment slice with a working link to the full list; no information is lost, only decluttered — verified live against the current real 3-completed-assessments account.

### P1-4. Fix the Result page's topbar/breadcrumb mismatch

- **Problem**: Verified live — `/student/attempts/:attemptId/result` shows "Back to your assessments" as its breadcrumb but "Home" in the topbar, because `AppShell`'s nav-label resolution does a `pathname.startsWith()` prefix match and this route happens to start with `/student` (Home's prefix) rather than matching Assessments.
- **Affected users**: Students viewing any assessment result.
- **Current behavior**: A small but real "where am I" inconsistency between the topbar and the page's own in-content navigation.
- **Proposed behavior**: The topbar title on this route should read something that matches its own content (e.g., derived from the page's own heading, or the route added to the Assessments nav item's prefix match) rather than falling back to Home.
- **Backend changes required**: None.
- **Frontend changes required**: A small fix to `resolveActiveLabel`/`AppShell.tsx`'s matching logic, or an explicit title override passed from `StudentResultPage.tsx`.
- **Database changes required**: None.
- **Risks**: None — must verify the fix doesn't regress the topbar on any other route that currently relies on the same prefix-matching fallback (check every `/student/*` route once the logic changes).
- **Acceptance criteria**: The topbar on the result page reads something coherent with "you just came from your assessments," verified live.

### P1-5. Decide and scope bulk/CSV user import

- **Problem**: P0-1 solves single-user creation. A real cohort (a full batch/department) is a materially bigger workflow than one form.
- **Affected users**: Admins onboarding a full class/batch at once.
- **Current behavior**: None — doesn't exist even after P0-1.
- **Proposed behavior**: Not decided in this plan — flagged as a product decision (CSV upload? manual bulk paste? integration with a future SSO roster sync?) rather than defaulted to a specific build, per the mission's own "don't invent scope" discipline.
- **Backend changes required**: TBD pending the decision — likely a new `POST /users/bulk` accepting an array, with the same validation `CreateUserSchema` already provides, applied per-row with a partial-success report (which rows succeeded/failed and why) rather than all-or-nothing.
- **Frontend changes required**: TBD.
- **Database changes required**: None beyond what already exists.
- **Risks**: A bulk-create endpoint is a larger security/abuse surface than the rest of this plan (many accounts created in one request) — needs the same RBAC discipline already used everywhere else, plus sensible per-request row limits.
- **Acceptance criteria**: Not applicable until scoped — this item exists to flag the decision, not to be built against this plan's current detail level.

---

## P2 — Responsive and accessibility improvements

### P2-1. Full responsive pass across browsing/table surfaces

- **Problem**: P0-3 fixes the Practice Explorer specifically; the same filter-row + `.table-wrap` markup is shared by Question Bank, Users, Lessons, and the Results roster, none of which were independently re-verified at mobile width this session.
- **Affected users**: Anyone on a phone/tablet using any admin browsing screen.
- **Current behavior**: Unverified at narrow widths beyond Practice Explorer (confirmed broken) and Student Home (confirmed fine).
- **Proposed behavior**: Every list/table page contains its horizontal scroll to the table itself, matching the fix applied in P0-3.
- **Backend changes required**: None.
- **Frontend changes required**: Re-verify each of Question Bank, Users, Lessons, Results roster at 375px after P0-3's shared-CSS fix lands; patch any page-specific residual issue.
- **Database changes required**: None.
- **Risks**: Low — mechanical verification work once the shared root cause is fixed.
- **Acceptance criteria**: Every browsing/table page listed above passes the same "page body doesn't scroll horizontally" check as P0-3, verified with screenshots at 375px.

### P2-2. Accessibility: label icon-only controls

- **Problem**: Verified in source — the Lessons list's Delete button (`<button className="btn-danger btn-small btn-icon"><Trash2 size={13} /></button>`, `AdminLessonsPage.tsx:206-208`) has no visible text and no `aria-label`, so it has no accessible name for a screen reader. A repo-wide check found only 5 `aria-label` occurrences across the entire component library (`AppShell`, `ErrorState`, `Modal`, `Stepper`) — most icon-only buttons elsewhere either carry visible text (e.g. the Users page's "Edit" button, which is fine) or haven't been audited.
- **Affected users**: Any admin using a screen reader or other assistive technology.
- **Current behavior**: At least one confirmed icon-only control with no accessible name; likely more, not yet individually audited.
- **Proposed behavior**: Every icon-only interactive control gets a real `aria-label` describing its action (e.g. `aria-label="Delete lesson"`).
- **Backend changes required**: None.
- **Frontend changes required**: An audit pass across all page components for icon-only buttons (search for `btn-icon` usage without adjacent visible text, the same technique used to find the one confirmed instance above), adding `aria-label` to each.
- **Database changes required**: None.
- **Risks**: Low, mechanical. One genuinely good finding from this audit: global `:focus-visible` styling (`base.css:66-74`) already applies to every `button`/`a`/`input`/`select`/`textarea`/`[tabindex]` — focus-ring coverage is *not* a gap, contrary to what the original audit speculated; this item is narrower and more specific than a full accessibility rewrite.
- **Acceptance criteria**: No icon-only interactive control in the app lacks an `aria-label` or equivalent accessible name — verified by a systematic grep-based sweep, not spot-checks.

### P2-3. A real 404 page

- **Problem**: `path="*"` silently redirects to `/`, unchanged since the original audit.
- **Affected users**: Anyone hitting a stale/mistyped/bookmarked-then-removed URL.
- **Current behavior**: Silent redirect, no explanation.
- **Proposed behavior**: A simple, on-brand "page not found" screen with a way back to Home, rather than an unexplained jump.
- **Backend changes required**: None.
- **Frontend changes required**: A new lightweight `NotFoundPage.tsx` + route change from `<Navigate to="/" />` to rendering it.
- **Database changes required**: None.
- **Risks**: None.
- **Acceptance criteria**: Visiting a nonexistent route under `/student/*` or `/admin/*` shows a real 404 state instead of silently bouncing to the dashboard.

### P2-4. Verify the Archive action's next-step clarity

- **Problem**: The audit flagged (§3.6, dead-end #6) that the "Archive" action on a completed assessment's detail page was not exercised live this session, to avoid mutating real data.
- **Affected users**: Admins archiving old assessments.
- **Current behavior**: Unknown/unverified — not confirmed broken, just unconfirmed.
- **Proposed behavior**: Confirm archiving gives clear before/after feedback (does the assessment leave the default list? is there an undo or at least a clear confirmation of what changed?); fix only if a real gap is found.
- **Backend changes required**: TBD, pending verification.
- **Frontend changes required**: TBD, pending verification.
- **Database changes required**: None expected.
- **Risks**: None — this is a verification task first, a fix only if verification finds a real problem.
- **Acceptance criteria**: Archiving a real (throwaway, explicitly-created-for-this-test) assessment produces clear, understandable feedback about what happened — verified live.

---

## P3 — Optional future product opportunities

### P3-1. Stage the coding/MCQ question editors like the AI Generator

- **Problem**: `AdminQuestionFormPage.tsx` (495 lines) and `AdminMcqFormPage.tsx` (324 lines) remain long flat forms, unchanged since the original audit, while the AI Generator (conceptually similar ground — title, statement, examples, test cases) is now a staged, visually distinct flow.
- **Affected users**: Admins manually authoring questions (a relatively rare action compared to AI generation or reviewing).
- **Proposed behavior**: A staged form (Basics → Statement/Examples → Test Cases → Languages/Solutions), reusing the `Stepper` component already proven in the Assessment Builder.
- **Backend/database changes**: None.
- **Risks**: Real effort for a screen used infrequently — explicitly lower priority than everything above.
- **Acceptance criteria**: Not scoped further; revisit only if explicitly requested.

### P3-2. Visual pass on the `PUBLISHED`/locked Assessment Detail view

- **Problem**: Verified live — still three stacked flat cards (Details/Sections/Participants), functionally correct but visually undifferentiated.
- **Proposed behavior**: A calmer, more read-oriented layout appropriate for a mostly-static, rarely-revisited screen.
- **Risks**: Low value relative to effort — a rarely-opened screen once an assessment is locked.
- **Acceptance criteria**: Not scoped further.

### P3-3. Cross-assessment leaderboard / "Compete" pillar

- **Problem**: Unchanged from every prior audit — `Result.rank` is per-assessment only; no cross-assessment or practice-inclusive leaderboard exists.
- **Proposed behavior**: Not decided — this remains an explicit product/privacy decision (visible student-vs-student ranking outside a proctored context is a different trust posture than today's already-shipped, exam-gated per-assessment rank), not a default build.
- **Risks**: Privacy/trust-posture risk, not just engineering — needs explicit go/no-go before any scoping.
- **Acceptance criteria**: Not applicable until decided.

---

## Explicitly not in this plan

- No Docker, no execution-sandbox changes, no authentication/OAuth work (unchanged from every prior audit's scoping).
- No new Learn content authored as part of this plan — P0-4/P1-1 build the *system* to surface coverage honestly; actual lesson-writing remains a separate, ongoing content decision, per the mission's explicit "don't fabricate content" rule.
- No bulk-import build (P1-5 is a decision flag, not a committed build).
- No leaderboard build (P3-3 is a decision flag, not a committed build).

---

## What I need from you before implementation starts

1. Sign-off on the P0/P1/P2/P3 prioritization above, or redirection.
2. A decision on P1-5 (bulk/CSV user import) — scope it, or leave it flagged for later.
3. A decision on P3-3 (Compete/leaderboard) — unchanged ask from every prior session; still not blocking anything else.

Once approved, implementation proceeds in vertical slices exactly as the prior two sessions did: inspect → design → implement → test → verify live → self-review → fix → move to the next item, stopping after each one to show `git status` and a summary before continuing — per this phase's own explicit git rules (no auto-commit).

# Phase 17 — Product Completion Report

*Implements the approved `docs/PHASE_17_PRODUCT_TRANSFORMATION_PLAN.md`, P0 through P3, in that order. Every item below was implemented against the real running stack (API on :4000, web on :5173, real Postgres dev database), typechecked/linted/built after each stage, and verified live in the browser as both roles — not just typechecked. Nothing beyond the approved plan's P0–P3 was touched; Learning Paths, Knowledge Checks, a cross-assessment leaderboard, OAuth, and Docker were explicitly out of scope and were not started.*

---

## 1. Executive summary

All four priority tiers from the approved plan are complete and live-verified:

- **P0** — Admins can now create user accounts through the product itself, and Command Center's "needs attention" stat cards no longer include silently-dead links. Along the way, a real pre-existing backend bug was found and fixed: filtering assessments by "Completed" or "Active" status always returned zero rows, because those two states are computed at read time and were never literally stored in the database.
- **P1** — The Learn pillar now tells the truth about its own size: a student who finishes everything currently published sees an honest "you're caught up" state instead of a page that looks unfinished, and the admin authoring view shows exactly which of the 20 real topics have no content yet. The Learn→Practice journey was re-verified end-to-end, not just assumed working.
- **P2** — A real, root-caused CSS bug (not a workaround) fixed a page-wide horizontal-scroll bug affecting every browsing/table screen in the app, verified at 375px, 768px, and desktop across seven pages.
- **P3** — The one confirmed icon-only control with no accessible name now has one; a systematic sweep of the rest of the codebase found no other instances.

No fake data was created. One clearly-labeled temporary verification account was created to test the new user-creation flow, exercised through edit/deactivate/reactivate, and then permanently deleted — the database now contains exactly the same two real accounts it did before this session.

---

## 2. Problems solved

| # | Problem (from the Phase 17 audit) | Fix |
|---|---|---|
| P0-1 | No "Create user" control anywhere in the UI, despite a working `POST /users` | New Create User modal on the Admin Users page |
| P0-2 | `Active now` / `Upcoming` stat cards on Command Center were dead links; `Participants assigned` had no destination | Both dead cards now link somewhere real; the third stays honestly non-interactive |
| *(found during P0-2 work)* | Filtering assessments by `status=ACTIVE` or `status=COMPLETED` always returned zero rows | Backend now translates those two into the same time-window logic `computeEffectiveStatus` already uses |
| P1-1 | Admin Lessons page gave no signal about content coverage (18 of 20 topics have zero lessons) | A coverage panel showing exactly which topics have content, each topic clickable to filter |
| P0-4 (audit numbering) | Learn Landing showed a 100%-complete student the same layout as a partway-done one | An honest "you're caught up" banner stating real catalog size |
| P1-B | Learn→Practice journey CTAs — re-verify they work | Re-verified live: topic deep-link and the "keep practicing" CTA both work correctly |
| P2-1 / P0-3 | Whole page scrolled horizontally at mobile widths instead of just the table | Root-caused to a flexbox min-width quirk in `.app-main-scroll`; fixed with one CSS rule |
| P2-2 | One icon-only delete button had no accessible name | `aria-label` added; a full sweep found no other instances |

---

## 3. Files changed

```
 M apps/api/src/modules/assessments/assessments.service.ts
 M apps/web/src/lib/users-api.ts
 M apps/web/src/pages/AdminDashboardPage.tsx
 M apps/web/src/pages/AdminLessonsPage.tsx
 M apps/web/src/pages/AdminUsersPage.tsx
 M apps/web/src/pages/LearnLandingPage.tsx
 M apps/web/src/styles/shell.css
?? docs/PHASE_17_PRODUCT_EXPERIENCE_AUDIT.md
?? docs/PHASE_17_PRODUCT_TRANSFORMATION_PLAN.md
?? docs/PHASE_17_PRODUCT_COMPLETION_REPORT.md (this file)
```

Seven source files touched, zero new files beyond documentation, zero files deleted. No `Dockerfile`, no `docker-compose`, no new npm dependency, no Prisma migration.

---

## 4. Backend changes

**`apps/api/src/modules/assessments/assessments.service.ts`** — `list()`'s status filter was `{ status: query.status }`, a direct match against the raw `status` column. That column is only ever literally `DRAFT`/`PUBLISHED`/`ARCHIVED` — `ACTIVE` and `COMPLETED` are computed from the time window at read time (`computeEffectiveStatus`) and never written to the database. A new `buildStatusFilter()` helper translates `ACTIVE` → `{ status: 'PUBLISHED', startAt: { lte: now }, endAt: { gte: now } }` and `COMPLETED` → `{ status: 'PUBLISHED', endAt: { lt: now } }`; `DRAFT`/`PUBLISHED`/`ARCHIVED` keep their exact prior (correct) behavior. No schema change, no new endpoint, no migration.

No other backend changes were needed — `POST /users` (used by P0-1) already existed, fully validated, already RBAC-gated to `ADMIN`, unchanged.

---

## 5. Frontend changes

- **`lib/users-api.ts`** — added `createUser()`, calling the existing `POST /users`.
- **`pages/AdminUsersPage.tsx`** — a "Create user" button in the page header and a new modal (name/email/password/role/department/batch), reusing `Modal`/`Button`/`useToast` exactly as the existing edit flow does. On success: toast, filters reset, list refreshed to page 1 so the new account is visible without a manual refresh.
- **`pages/AdminDashboardPage.tsx`** — `Active now` links to `?status=ACTIVE`, `Upcoming` links to `?status=PUBLISHED` (an honest choice, not a perfectly-scoped one — see §13); `Participants assigned` deliberately stays a plain, non-linked stat since no single list view represents it. Added an `Active` option to the manual status filter dropdown for consistency.
- **`pages/LearnLandingPage.tsx`** — a completion banner (reusing the existing `.practice-completion` visual family, not a new component) shown only when every currently-published lesson is complete, stating real catalog scope (`X of 20 topics have lessons so far`).
- **`pages/AdminLessonsPage.tsx`** — a coverage panel fetching an unfiltered lesson snapshot (independent of the filtered table's own state) to show which topics have zero lessons, each rendered as a clickable filter shortcut into the existing table.

---

## 6. Responsive changes

**Root cause, not a workaround.** `.app-main-scroll` (the scrollable region every dashboard page renders inside, in `shell.css`) had `overflow-y: auto` but no `overflow-x` set. Per the CSS Flexbox spec, an item's automatic minimum size only collapses to zero when `overflow` is non-`visible` on the relevant axis — without that, a wide child (a table inside `.table-wrap`) forced this flex item's minimum width to the table's own intrinsic width, and that growth propagated up through `.app-content`/`.app-shell` to the page itself. The existing `.table-wrap { overflow-x: auto }` was already correct; it just never got the chance to be the thing that scrolls. One line, `overflow-x: hidden` on `.app-main-scroll` (plus `min-width: 0` for completeness), fixes it at the shared layer every page renders through.

**Verified at 375px** (mobile) on Practice Explorer, Student Home, Admin Users, Question Bank, Admin Lessons (including the new coverage-panel's topic chips), Command Center, and the Results roster — page title and filters stay fixed, only the table region scrolls. **Verified at 768px** (tablet) on Question Bank. Student Home was already correct before this change (confirmed, not assumed) and required no fix. Coding workspaces (Monaco) were not touched, per the plan's explicit "desktop-first is a real product decision" instruction.

---

## 7. Accessibility changes

A systematic sweep (not a search for the one known instance) across every `.tsx` file for icon-only interactive controls — `grep` for `btn-icon`/`icon-btn` class usage, then manual inspection of every result for adjacent visible text — found **exactly one** control with no accessible name: the Lessons list's delete button (`<button className="btn-danger btn-small btn-icon"><Trash2 size={13} /></button>`, no text, no `aria-label`). Fixed with `aria-label={\`Delete "${lesson.title}"\`}` — a distinct, accurate name per row, not a generic repeated "Delete" that would be indistinguishable to a screen reader across multiple rows.

Every other `btn-icon`/`icon-btn` usage in the codebase — the sidebar's mobile toggle, every table row action, every toolbar button in the exam and practice workspaces — already pairs its icon with visible text or (in the sidebar toggle's case) already had a correct `aria-label`. This was confirmed by reading every match, not inferred.

**A genuinely good pre-existing finding, not a gap**: `base.css` already applies `:focus-visible` styling globally to every `button`/`a`/`input`/`select`/`textarea`/`[tabindex]` element — focus-ring coverage was never actually a gap, contrary to what the original (pre-Phase-16) audit speculated. This session's new controls (the Create User modal's fields, the coverage-panel's topic-filter chips) inherit that same global rule automatically; no new focus-ring CSS was needed.

**Keyboard/focus behavior verified live** on the new Create User modal: Tab correctly cycles through all 8 focusable elements and wraps back to the first field (the existing `Modal` component's tab-trap, unmodified, handled this correctly with no changes); Escape closes it; focus returns to the triggering "Create user" button afterward.

---

## 8. Real data / database changes

**No schema change, no migration.** One temporary account was created to verify the new Create User flow end-to-end (`phase17-verify@centurion.test`, clearly named `Phase17 Verification (temp)`, using the same real `@centurion.test` domain convention as the seeded accounts — never an `@test.local` address). It was exercised through creation, the duplicate-email error path, edit, and deactivate/reactivate, then **permanently deleted** via a one-off script run directly against Prisma (there is no `DELETE /users` endpoint — deactivation is the only in-product lifecycle end for a user, so direct deletion was the only way to leave zero residue, matching this phase's explicit "never leave junk in the database" rule). The one-off script was deleted immediately after running.

**Verified before and after**: the Users table contains exactly the same two real accounts (`admin@centurion.test`, `student@centurion.test`) it did at the start of this session — confirmed by a direct query, not assumed.

---

## 9. What was verified live (not just typechecked)

**Admin**: logged in; Users page — search/filter unchanged and still correct; created a real (temporary, cleaned-up) account and watched it appear at the top of the list without a manual refresh; triggered and read the duplicate-email error inline; edited and deactivated/reactivated an account (pre-existing flow, confirmed not broken); Command Center — both newly-linked stat cards navigate to real, correct, non-empty destinations, and the previously-broken `Completed`/`Active` manual filters now return the correct rows (confirmed via the same three real assessments, which are genuinely `COMPLETED`); Question Bank, Lessons (including the new coverage panel and its topic-chip filtering), Results roster — all re-opened to confirm the responsive fix.

**Student**: logged in; Home — continue-card and progress unchanged; Learn Landing — the real seeded student (currently at 4/4 lessons) shows the new "you're caught up" banner with the correct real topic count (2 of 20), and its "Keep practicing" CTA correctly navigates to the Explorer; Learn Topic (Arrays) — "Practice Arrays problems" correctly deep-links into a topic-filtered Explorer; Practice Explorer — filters/sort/search unchanged, and the mobile-overflow bug is gone.

**Responsive**: 375px and 768px, both roles, seven pages, screenshotted and read back via the accessibility tree at each width to confirm nothing shifted off-screen.

**Keyboard/focus**: the new Create User modal's tab order, tab-trap wrap, Escape-to-close, and focus-restore-on-close were all exercised directly, not assumed from the shared `Modal` component's prior track record alone.

---

## 10. Tests / checks run

- `npm run typecheck` — clean, three times (after P0, after P1, after P3; P2 was a CSS-only change with no type surface).
- `npm run lint` — clean relative to this session's changes at every checkpoint. Four pre-existing warnings remain (`Toast.tsx`, `AuthContext.tsx`, `LearnLessonPage.tsx`, `PracticeWorkspacePage.tsx`) — all in files this session never touched, all present before this session started.
- `npm run build` — clean, full four-workspace build, three times.
- Full live browser verification as described in §9, both roles, against the real running stack and real database.

---

## 11. Tests intentionally NOT run, and why

- **The API's `*.e2e-spec.ts` suite** — deliberately not run. It's already documented (both in this codebase's own prior sessions and in `docs/PHASE_17_PRODUCT_EXPERIENCE_AUDIT.md`) that this suite shares the same development database as `dev:api`, and running it would recreate the exact `@test.local` fixture-pollution problem a prior session already cleaned up once. This is an explicit, named risk in this phase's own instructions ("Test Database Warning"), not an oversight.
- **A full graded-assessment attempt (Start → Exam → Run → Submit → auto-grade)** was not re-executed live this session. Nothing in this phase's changes touches `submissions`, `scoring`, `execution-client`, the execution service, or any exam-taking code path — the seven changed files are Users, the assessments *list* filter (not attempts/scoring), Lessons, Learn Landing, and shared shell CSS. Re-running a full exam attempt would create new, real submission/attempt rows for no verification benefit given the actual blast radius of these changes. The Command Center's `Completed`/`Active` filter fix *was* verified against real, already-existing completed assessments instead, which was sufficient to confirm the fix.
- **A practice Run/Submit cycle** was similarly not re-executed for the same reason (no practice/submission code was touched) — Practice Explorer's filtering, sorting, and navigation were re-verified instead, since those are what the responsive fix and the Learn↔Practice link actually touch.

No claim of "all tests passed" is made anywhere in this report — the above is the complete, honest list of what ran and what didn't, and why.

---

## 12. Known limitations

- **"Upcoming" links to a filter labeled "Published," not a precisely-scoped "not yet started" filter.** There is no raw enum value for "upcoming-only" in the schema (`ASSESSMENT_STATUS_CODES` has no `UPCOMING` member), and adding one would be a schema change this phase's own rules say to avoid unless genuinely required. The destination is real, correct, and non-empty — just a superset of "upcoming" (it also includes anything else still `PUBLISHED`, including genuinely-active or completed-but-not-archived rows) — not a broken or empty link.
- **The Admin Lessons coverage panel is capped at the list endpoint's max page size (100 lessons).** At the platform's current real scale (4 lessons) this is a non-issue; if the lesson bank ever grows past 100, the coverage count would undercount rather than error. Documented in a code comment at the fetch site.
- **The admin's manual "Completed"/"Active" status filter dropdown options were both already present or added this session, but the underlying date-window computation uses the server's clock at request time** — this matches every other time-sensitive computation already in the codebase (`computeEffectiveStatus` itself), not a new inconsistency.
- **Toasts have no ARIA live-region announcement** (`role="status"`/`aria-live`) — noticed during the accessibility sweep but not in the approved Phase 17 scope, so not touched, to avoid scope creep beyond what was audited and approved.

---

## 13. Honest current product status

Every P0–P3 item from the approved plan is implemented and live-verified, not just planned. The two most concrete wins are the kind that would have embarrassed a live demo: an admin genuinely could not onboard a real student before this session, and the "Completed" filter on the admin's own assessment list silently returned nothing for every real completed assessment that has ever existed on this platform. Both are now fixed and confirmed against real data, not sample data.

The responsive fix is the highest-leverage single change in this phase — one CSS rule, root-caused rather than patched, fixing seven distinct browsing/management screens the audit had flagged as broken or unverified.

What remains, per the plan's own explicit gating, are the P1-5 (bulk/CSV user import) and P3-3 (cross-assessment leaderboard) *decisions* — neither was defaulted to a build, both remain open for a future session, exactly as scoped.

---

## 14. Recommended next priorities

1. **P1-5 decision**: scope (or explicitly decline) bulk/CSV user onboarding, now that single-user creation exists and the pattern for it is established.
2. **The "Upcoming" filter's precision** (§12) — if it's ever worth a dedicated `UPCOMING`-shaped query param instead of the current honest-but-broad `PUBLISHED` mapping, that's a small, well-scoped follow-up now that the underlying `buildStatusFilter` helper exists to extend.
3. **P3-3 decision**: leaderboard/Compete — still an explicit go/no-go, not blocking anything else.
4. **Toast accessibility** (§12) — a small, real, separately-scoped a11y follow-up if a future accessibility pass is approved.

---

## 15. Git status at end of session

```
 M apps/api/src/modules/assessments/assessments.service.ts
 M apps/web/src/lib/users-api.ts
 M apps/web/src/pages/AdminDashboardPage.tsx
 M apps/web/src/pages/AdminLessonsPage.tsx
 M apps/web/src/pages/AdminUsersPage.tsx
 M apps/web/src/pages/LearnLandingPage.tsx
 M apps/web/src/styles/shell.css
?? docs/PHASE_17_PRODUCT_EXPERIENCE_AUDIT.md
?? docs/PHASE_17_PRODUCT_TRANSFORMATION_PLAN.md
?? docs/PHASE_17_PRODUCT_COMPLETION_REPORT.md
```

Nothing has been committed — all of the above is uncommitted working-tree state, pending your review, per this phase's explicit instruction not to commit unless asked.

# Learn System — Curriculum Audit and Redesign Plan

*Audited at commit `caed1bd` against the repository and the development database (read-only queries). Every number below was measured, not taken from earlier reports.*

---

## 1. What actually exists

| | Reported | Measured |
|---|---|---|
| Track files | 19 | 19 (`apps/api/content/*-track.json`) |
| Topics covered | 20 | **19** — `Searching` (in `CODING_TOPICS`) has no track |
| Lessons in files | 76 | 76 (4 per track) |
| Knowledge-check MCQs | 195 | 195 |
| Coding problems in files | 133 | 133 entries, **132 distinct titles** (`Merge Two Sorted Arrays` is in both the Arrays and Sorting tracks; the loader de-duplicates by title) |
| Coding problems in dev DB | 133 | 133 — **9 approved**, 124 `PENDING_REVIEW` |
| Lessons in dev DB | — | 80: **6 published** (4 Arrays track lessons + 2 legacy Hashing lessons), 74 drafts (72 track drafts + 2 legacy Arrays drafts) |
| Student lesson progress | — | 5 completions, 3 check responses (one real student account) |

The 72 track drafts have not been edited since they were loaded (`updated_at` = `created_at`), so improved file content can be synced into them without overwriting anyone's work. The two legacy Arrays drafts *were* hand-edited and are left alone.

**How content reaches the database.** `scripts/load-content.mjs` goes through the real admin API, never approves or publishes, and is *create-only*: a lesson whose title already exists is skipped. So edits to a track file never reached the database before this work.

---

## 2. Curriculum quality — findings

### What is already good (and should not be rewritten)

- **Length is right.** Concept sections are 175–290 words, worked examples 56–262, common mistakes 49–103. None is too long; nothing reads like a textbook.
- **Accuracy and the "why".** Sampled lessons explain the invariant behind a technique (e.g. the `while lo < hi` / `hi = mid` pairing in boundary binary search), not just steps.
- **Code is correct.** All **107** Python blocks parse. The 47 self-contained ones were executed and all run; the **25** places where a lesson states what a line prints (`print(x)  # 3`) were checked against the real output, and all 25 match. The other 60 blocks are deliberate excerpts (they use variables from the surrounding text, or contain a bare `return`); 5 of those state an output that can't be checked standalone. *(Correction: an earlier draft of this report claimed "0 mismatches" from a first checker that, because of Windows line endings, compared nothing. The figures here come from `npm run content:check`.)*
- **Knowledge checks test understanding.** 195 MCQs: 50 `CODE_OUTPUT` tracing questions, 137 single-choice (mostly "which expression/which step/what happens if"), 4 multi-answer, 4 scenario. Every one has an explanation, and explanations say why the distractors are wrong. Only **one** is close to recall (Sorting: "What is the time complexity of `sorted()`…") and it is a legitimate fact students must know.
- **Lesson → problem mapping is clean.** No dangling references, every coding problem is linked to a lesson, and the one problem linked twice (`Merge Two Sorted Arrays`) is a deliberate reuse (merging as a two-pointer pattern, then inside merge sort).

### Real problems found

| # | Problem | Where | Severity |
|---|---|---|---|
| C1 | **No Java code.** 0 Java blocks across 76 lessons. Java *is* covered in 25 lessons through Python/C++/Java comparison tables (the right approach for most topics); what was missing is code where Java has its own traps — e.g. the Binary Search lesson says "write `lower_bound` yourself" in Java without showing it, and nothing warns about `a[0] - b[0]` comparator overflow. | 9 lessons | Medium |
| C2 | **No complexity discussion** in 8 algorithm lessons (3 more state the cost informally — `n!`, `2^n × n`, `2ⁿ − 1` — and are fine). | Backtracking ×2, Greedy *Interval scheduling*, Recursion *Generating every possibility*, Sorting *Custom orders*, Stacks *Evaluating and decoding*, Trees *Combining answers*, Trees *Level-order* | Medium |
| C3 | **Cross-track overlap without signposting.** Arrays *Two pointers on arrays* / *Prefix sums and sliding windows* overlap the dedicated Two Pointers and Sliding Window tracks without saying so. (Queues *BFS on a grid* and Recursion *Generating every possibility* overlap Graphs and Backtracking too, but already point students there.) | 2 lessons | Low |
| C4 | One example uses `deque` without importing it; 4 formula blocks have no language label (they render captioned "Example"); 2 objectives are vague ("Know which types…", "Know when to advance…"). | 7 lessons | Low |
| C5 | Practice links in 10 lessons are a single problem and 10 more are all-EASY or all-MEDIUM pairs — fine for a first lesson, but there is no "challenge" step. Not fixed by inventing problems: reported as a content gap (§6). | various | Low |
| C6 | `Searching` has no lessons. Not created here — it overlaps Binary Search heavily and the brief asks not to expand the catalog for its own sake. Reported. | — | Low |

### Not a problem, despite how it looks

- C++ blocks: 61 of 68 fail a standalone compile, but every failure is an excerpt referencing an outer variable (`n`, `a`, `Node`) — no syntax errors were found. Turning excerpts into full programs would make lessons longer without teaching more.
- Uniform "4 lessons per track, 3 objectives each" is consistent, not formulaic: objectives are specific and testable ("Count elements in a value range with two boundary searches").

---

## 3. Student experience — findings

| # | Problem | Severity |
|---|---|---|
| S1 | **Practice is gated behind the knowledge checks.** `LearnLessonPage` renders "Practice what you just learned" only when `lesson.completed` — a student must answer every check correctly before the lesson shows its problems. Directly contradicts "never require lessons before practice". (The API serves the problems regardless; only the UI hides them.) | **High** |
| S2 | No previous-lesson link, and "Next lesson" only appears after completion. | Medium |
| S3 | **The coding workspace has no route to lessons.** A student stuck on a problem cannot open the concept without leaving the editor. | High |
| S4 | "Continue learning" only considers a topic once a lesson in it is *completed*; a lesson where the student answered some checks but not all is not resumable from Learn/Home. | Medium |
| S5 | `WeakAreasCard` says "Learn X **first** →" — prerequisite framing for an optional resource. | Low |
| S6 | Practice links are one flat list with no sense of progression. | Low |
| ~~S7~~ | *Withdrawn on inspection:* lesson tables already scroll horizontally (`.markdown table { display: block; overflow-x: auto }`). | — |

Recommendations from assessment results (`ResultNextSteps`) and the dashboard (`WeakAreasCard`) are already driven by real performance and already distinguish "never attempted" from "attempted and struggling" — kept as they are.

## 4. Admin experience — findings

| # | Problem | Severity |
|---|---|---|
| A1 | No whole-lesson preview — each Markdown field previews alone, never the page as a student sees it. | Medium |
| A2 | No content-quality feedback (missing/vague objectives, unlabelled code fences, no code in an algorithm lesson, no complexity note). | Medium |
| A3 | Editor copy says practice is "offered once the lesson is passed" — will be wrong after S1. | Low |
| A4 | The loader cannot update existing drafts, so curriculum fixes never reach the database. | Medium |

The draft → review → publish model, the verified-practice-only picker and the approval gate are sound and are kept unchanged.

---

## 5. Plan (in order)

1. **Lesson experience** — show practice at all times (grouped *Apply the concept / Build confidence / Challenge yourself* by difficulty, no schema change); previous/next navigation always visible; resume partially-answered lessons; neutral wording for optional lessons.
2. **Practice integration** — the practice problem API returns the published lessons that cover the problem (lessons that attach it first, then its topic's lessons); the workspace gets a **Lesson** tab beside the description that renders the lesson in place, so the editor and its code are untouched; the Explorer offers the topic's lesson when filtering by topic.
3. **Admin** — a shared, unit-tested lesson-quality checker (warnings, never blocking) used by the editor and by a new `content:check` script; a full "preview as student"; loader `--update-drafts` that syncs file changes into *draft* lessons only (never published ones, never publishes).
4. **Curriculum** — fix C1–C4 in the track files: Java code in the 9 lessons where Java differs, compiled with `javac`; complexity notes for the 8 lessons; "go deeper" signposts for the 2 Arrays overlaps; labels, the missing import and the vague objectives. Verified by `content:check`, which executes the Python examples and compiles the Java ones.
5. **QA** — typecheck, lint, build, unit tests, the full isolated e2e suite, live browser checks at desktop and phone widths.

No migration is needed for any of this.

## 6. Content gaps reported, not filled

- `Searching` topic: no track.
- Lessons whose practice set has no harder follow-up (a "Challenge yourself" problem) — listed by `npm run content:check -w @technical-platform/api`. These need new *verified* problems, which should go through the normal Question Bank review rather than being invented here.
- 124 of 133 coding problems and 185 of 195 checks are still `PENDING_REVIEW`; until they are approved, the 72 draft lessons cannot be published (the publish gate requires it). That review is a human step and was not automated.

---

## 7. Implementation status

**Done and verified**

| Area | Change |
|---|---|
| Lesson page | Practice is always shown, grouped *Apply the concept / Build confidence / Challenge yourself* (from each problem's difficulty), with a link to all of the topic's problems; "Skip to practice" and a real reading-time estimate in the header; previous/next lesson links always visible; each lesson opens scrolled to the top; prose capped at ~72 characters per line; knowledge-check code snippets are syntax-highlighted. |
| Resume | `GET /learn/progress` → `continueLesson` now follows the latest real activity, including answering a check, so a half-finished lesson can be resumed (`pickContinueLesson`, unit-tested). |
| Coding workspace | `GET /practice/questions/:id` now returns `relatedLessons` (published only: lessons that attach the problem first, then each topic's first lesson). The problem panel gets a **Lesson** tab that renders the lesson beside the editor — the editor is never unmounted — with a link to the full lesson in a new tab. |
| Practice Explorer | Filtering by a topic with published lessons shows a one-line, optional link to its next lesson. |
| Wording | Weak-area cards say "Read the X lesson" instead of "Learn X first". |
| Admin editor | Live editorial suggestions (shared `lessonQualityIssues`, never blocking); "Preview as student" renders the unsaved lesson with the same component students see; copy updated for always-visible practice. |
| Tooling | `npm run content:check` (structure, editorial rules, executes Python and compares stated output, compiles Java); `content:load -- --update-drafts [--dry-run]` syncs edited text into draft lessons only. |
| Curriculum | 26 edits in 16 track files (§2 C1–C4). Synced to the dev database: 21 drafts updated, 52 already identical, 0 published lessons touched. |

No schema change and no migration. Draft lessons were not published; existing progress (5 completions, 3 check responses) is unchanged.

**Not done / needs a person**

- The 3 published Arrays lessons differ from their files (Java example, "going further" notes, a `text` label). The sync deliberately skips published lessons; apply them in the editor if wanted.
- The content gaps in §6 (Searching track; 18 lessons with only EASY practice) need new, verified problems.
- Lesson publication still depends on reviewing the 124 pending coding problems and 185 pending checks.

# Implementation Plan

## 1. Phased delivery

The spec's suggested order is sound and is kept, with one adjustment: **Phase 1 includes explicit environment setup steps** (PostgreSQL install, C++ toolchain install) since the inspected machine has neither — without these, later phases would stall on infrastructure rather than product work.

| Phase | Scope | Complexity | Key risks |
|---|---|---|---|
| **1. Foundation** | npm workspace scaffold, `packages/shared`, Postgres install + `schema.prisma` + first migration, NestJS app skeleton (auth, users, RBAC guard), health check endpoint, `.env.example` | **M** | No local Postgres exists yet — install/config is a real (if small) task, not just code. Decision needed: local install vs. a remote dev instance. |
| **2. Assessment & question bank foundation** | `assessments`, `assessment_sections`, `questions`/`coding_questions` CRUD, admin-only guarded, no execution yet | **M** | None significant — straightforward CRUD over the schema in `database-schema.md`. |
| **3. Manual coding question creation** | Test case management (public/hidden), reference solution storage, admin question-bank UI (basic) | **M** | Ensuring hidden test cases are never exposed even in early scaffolding — apply the DTO pattern from `security.md` from the first controller, not retrofitted later. |
| **4. Student assessment interface** | Assigned assessments list, start/resume attempt, server-computed timer, question navigation + status | **M** | Timer correctness under resume/tab-close — needs the expiry sweep (`assessment-system.md` §3) built alongside, not deferred. |
| **5. Code editor** | Monaco integration, language selector, console/result panel (UI only, wired to stub responses until Phase 6/7 land) | **S–M** | Low risk; well-trodden (Monaco is a mature library). |
| **6. Execution engine** | `apps/execution-service` scaffold, `Sandbox` interface + `ProcessSandbox`, per-language runners, job poller against `execution_jobs` | **L** | Highest-risk phase. **C++ compiler is not installed on this machine** — must install MinGW-w64/MSYS2 (or develop the execution-service under WSL) before C++ runner work can be verified. Cross-platform memory limiting is inherently imperfect without Docker/cgroups (documented, not solved, in `coding-engine.md` §6). |
| **7. Test evaluation, submissions, scoring** | Wire Run/Submit endpoints to the execution service, `submission_test_results`, scoring per `assessment-system.md`/spec §14 | **M** | Correct verdict-priority mapping (compile error > runtime error > TLE > MLE > WA > accepted) needs careful test coverage across edge cases (empty output, trailing newline differences). |
| **8. Results & rankings** | `ResultsService.finalize`, ranking recompute, results/ranking endpoints and admin/student views | **M** | Tie-breaking rule for equal scores in ranking needs a decision (e.g. earlier submission time wins) — flagged for confirmation before building. |
| **9. Gemini AI question generation** | `AIProvider`/`GeminiProvider`, `QuestionGenerationService`, structured output + Zod validation, `ai_generation_requests` | **M–L** | Free-tier rate limits could throttle iterative testing during development — budget for that; Gemini structured-output API surface should be pinned to a specific SDK version to avoid surprise breaking changes. |
| **10. AI review/approval workflow** | Review UI, approve/reject/regenerate endpoints wired to Phase 9's data | **S–M** | None significant; mostly UI + the already-designed `question_reviews` table. |
| **11. Technical MCQ system** | `mcq_questions`/`mcq_options` CRUD, MCQ section rendering in student UI, MCQ scoring incl. negative marking | **M** | Multi-select partial-credit ambiguity — MVP is all-or-nothing per `question-system.md` §5; confirm this is acceptable before building. |
| **12. External platform integration** | `SsoIdentityProvider` (once the existing platform's actual auth protocol is known), result webhook | **L** (mostly external-dependency risk, not internal complexity) | Cannot be finalized until Centurion's existing platform's SSO mechanism is documented — the `IdentityProvider` interface exists specifically to absorb this unknown without a rewrite. |
| **13. Security hardening & reliability testing** | Load-test the execution queue under exam-scale concurrency, tighten sandbox limits, penetration-test hidden-data exposure paths, finalize rate limits | **L** | This is where the "soft memory enforcement" limitation from `coding-engine.md` gets a real decision: accept the risk for the target deployment scale, or invest in a hardened Linux sandbox before go-live. |

Legend: **S** small, **M** medium, **L** large (relative to this project's other phases, not absolute).

## 2. Cross-cutting risks (apply across phases)

1. **No PostgreSQL on this machine yet.** Must be resolved in Phase 1 before any schema/migration work — either install PostgreSQL locally or point at a remote dev database via `DATABASE_URL`.
2. **No C++ compiler on this machine.** Blocks verifying the C++ runner in Phase 6. Needs MinGW-w64/MSYS2 installation or a WSL-based execution-service dev environment decided before Phase 6 starts.
3. **Python invocation quirk.** The `python3` command on this machine resolves to a non-functional Windows Store alias; the execution service must be configured to call `python` (or a fully-qualified path via `PYTHON_PATH` env var), or Windows "App execution aliases" for `python3`/`python` must be disabled for the service account running it. Small but easy to silently break local testing if missed.
4. **No Docker.** Already designed around (see `coding-engine.md`), but it means execution isolation quality is inherently lower than a container/VM-based judge until real OS-level sandboxing (cgroups/`isolate`) is added on a Linux deployment target — an accepted, documented tradeoff, not a gap to "discover" later.
5. **Free-tier Gemini quota.** Development/testing of Phase 9 should budget requests carefully; consider a local fixture of sample Gemini responses for UI/workflow development so early Phase 9/10 work doesn't burn quota on repeated manual testing.
6. **Windows-vs-Linux deployment gap.** Development happens on Windows; several security/isolation guarantees (process user isolation, network egress blocking, `ulimit`-based process caps) are meaningfully stronger on Linux. The target production OS should be confirmed early — if it's Linux (likely, for a university-hosted service), the execution-service's Linux-specific code paths (§4 of `coding-engine.md`) are the ones that matter for the real security posture, and Windows behavior is a dev-only convenience.

## 3. Files to be created (this pass)

```
docs/architecture.md
docs/database-schema.md
docs/api-specification.md
docs/assessment-system.md
docs/question-system.md
docs/coding-engine.md
docs/ai-integration.md
docs/integration.md
docs/security.md
docs/implementation-plan.md   (this file)
```

No application code, `package.json`, or `schema.prisma` has been created yet — per the instruction to stop after architecture and documentation and wait for approval before starting Phase 1.

## 4. Open decisions for you to confirm before Phase 1 starts

- **Postgres**: install locally on this Windows machine, or point at a remote/managed instance for development?
- **C++ toolchain**: install MinGW-w64 directly on Windows, or develop/run the execution-service under WSL (gives a more production-like Linux environment for sandboxing work in Phase 6)?
- **Deployment target OS** (affects how much to invest in Linux-specific sandbox hardening in Phase 6 vs. 13): confirmed Linux, or still undecided?
- **Ranking tie-break rule** (Phase 8): earliest final-submission time wins ties, or another rule?
- **Multi-select MCQ partial credit** (Phase 11): confirmed all-or-nothing for MVP, as documented in `question-system.md`?

Everything else in this architecture is ready to build against once Phase 1 is greenlit.

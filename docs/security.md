# Security Architecture

This is treated as a real examination system: the threat model includes both external attackers and the exam-takers themselves.

## 1. Threats specific to an exam platform

| Threat | Mitigation |
|---|---|
| Student reads hidden test cases to hardcode outputs | Hidden test case rows are never selected into any student-facing DTO — see §2. |
| Student reads the reference solution | `coding_reference_solutions` has no route that returns it to a STUDENT-role request, by construction (only ADMIN-guarded controllers query it). |
| Student extends their own exam time via a tampered client clock | Timer is server-computed and server-enforced on every mutating call, not just displayed — see `assessment-system.md` §3. |
| Student submits after time expiry via a delayed request | Every attempt-scoped write re-checks `now() <= attempt.ends_at` at request time, independent of the expiry sweep. |
| Student forges a higher score by calling result/score-adjacent endpoints directly | Scores are only ever written by `SubmissionsService`/`ResultsService` server-side logic in response to sandbox execution output; no endpoint accepts a client-supplied score/status field. |
| Student accesses another student's submissions/results/attempt | Every attempt/submission read is scoped with an ownership check (`attempt.user_id === req.user.id`) in addition to role, not role alone. |
| Student escalates to admin-only endpoints | Global `RolesGuard` (Nest) on every controller, deny-by-default: a route with no explicit `@Roles(...)` decorator is rejected, not silently open. |
| Malicious code in a submission attacks the host (fork bomb, filesystem write outside its sandbox, network exfiltration, reading environment secrets) | Execution isolation — see `coding-engine.md` §4 and §4 below. |
| Gemini API key leaks to the frontend or logs | Key lives only in API server env, read once by `GeminiProvider`; no controller ever echoes provider errors verbatim; see §5. |
| SQL injection | Prisma parameterizes all queries; no raw string-interpolated SQL anywhere in the codebase (enforced by code review — `prisma.$queryRawUnsafe` is banned outright). |
| Brute-force login | Rate limiting on `/auth/login` (Nest `ThrottlerModule`, e.g. 5 attempts/min/IP) + account lockout after repeated failures. |
| Token theft / replay | Short-lived (15 min) access tokens; refresh tokens rotated on every use and stored httpOnly+Secure+SameSite; revocation list checked on refresh. |

## 2. Hidden data protection — enforced at the code boundary, not by convention

Every response that includes question data goes through an explicit response DTO/mapper, never a raw Prisma object:

```ts
// Illustrative — the actual rule, not implementation detail
function toStudentFacingCodingQuestion(q: CodingQuestionWithRelations): StudentCodingQuestionDto {
  return {
    id: q.id,
    title: q.title,
    problemStatement: q.problemStatement,
    // ...
    publicTestCases: q.testCases.filter(tc => !tc.isHidden).map(toPublicTestCaseDto),
    // hidden test cases and reference solutions are not present on this type at all —
    // not "omitted at serialization", structurally absent from the DTO's TypeScript type
  };
}
```

Because `StudentCodingQuestionDto` has no field for hidden test cases or reference solutions, a future engineer adding a field to the admin DTO cannot accidentally leak it to students by forgetting a filter — there is nothing to forget; the type doesn't have the field. The same pattern applies to `submission_test_results`: the student-facing submission DTO includes `passed`/`runtime_ms`/`memory_kb` for hidden test cases but omits `actual_output` for any row where `is_hidden = true`.

## 3. Authentication & authorization

- **Authentication**: JWT (access + refresh), Passport strategies, bcrypt (cost factor ≥ 12) for password hashing. See `integration.md` for the `IdentityProvider` abstraction that will carry SSO later.
- **Authorization**: role-based via a global `RolesGuard` reading `@Roles('ADMIN')`/`@Roles('STUDENT')` metadata; deny-by-default as noted above. Ownership checks (attempt/submission belongs to the requesting user) are a second guard layer applied on top of role checks, not a substitute for them.
- **Every permission check happens server-side.** The frontend hiding an "Approve" button for a non-admin user is a UX nicety; the actual `POST /questions/:id/review` controller re-checks the role independent of what the UI allowed the user to click.

## 4. Execution isolation (summary — full detail in `coding-engine.md`)

- Separate OS process (`execution-service`), never in-process with the API.
- No shared environment/secrets: child processes for student code run with a stripped environment (no `DATABASE_URL`, no `GEMINI_API_KEY`, no JWT signing secret — those exist only in the API and execution-service's *own* process env, never passed to the spawned child).
- Dedicated, least-privileged Postgres role for the execution service (grants limited to `submissions`, `submission_test_results`, `execution_jobs`, and read-only on `coding_questions`/`coding_test_cases`/`coding_question_languages`) — even a fully compromised execution-service process cannot read `users`, `assessments`, or credentials tables.
- Per-run temp filesystem isolation, timeouts, best-effort memory/process limits — see `coding-engine.md` §4 and its explicitly documented limitations (§6 there).
- Compiler/runtime error text shown to students is capped in length and stripped of absolute host filesystem paths before storage, so it can't be used to fingerprint the host.

## 5. Secrets management

- `.env` (never committed — `.gitignore`d) holds `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GEMINI_API_KEY`, `EXECUTION_SERVICE_SHARED_SECRET`. `.env.example` documents every required variable with a placeholder, no real values.
- Secrets are read via a single typed config module (`ConfigModule` with Zod-validated env schema) at startup — the process fails fast with a clear error if a required secret is missing, rather than limping along with `undefined` and failing confusingly later.
- The internal API↔execution-service HTTP channel is authenticated with `EXECUTION_SERVICE_SHARED_SECRET` (a bearer header) and bound to `127.0.0.1`/localhost only — not exposed on any public interface.

## 6. Input validation

- Every request body/query/param is validated against a Zod schema before reaching business logic (Nest pipe) — rejected requests never reach a service method.
- AI-generated content gets a **second**, independent validation pass (see `ai-integration.md` §5) before it can become a database row, since it is semantically "external input" even though it originates from a request the admin trusted.
- File-less by design for MVP: submitted code is stored as a `TEXT` column, never written to a location the API process itself executes from — only the execution-service's throwaway temp directories touch it as a file.

## 7. Rate limiting

- `/auth/login`: per-IP throttling as noted in §1.
- `/ai/questions/generate`: per-admin throttling (in addition to Gemini's own rate limits) so a scripting error or accidental double-click can't spray requests at the free-tier quota.
- `/assessments/:id/run` and `/submit`: per-student-per-question throttling (e.g. no more than 1 request per 2 seconds) to prevent a scripted submission flood from starving the execution-service queue during a live exam.

## 8. What is explicitly out of scope for MVP (flagged, not silently skipped)

- Full audit logging of every admin action (question edits, approvals) beyond the existing `question_reviews` table — a general `audit_log` table is a clean future addition once a concrete compliance requirement names what must be logged.
- Anti-cheating measures beyond timer/submission integrity (e.g. tab-switch detection, plagiarism/code-similarity detection across submissions, webcam proctoring) — none of these were requested in the spec; noted here so their absence is a documented decision, not an oversight.
- Hardened production sandboxing (real cgroups/namespace isolation) — see `coding-engine.md` §6, tracked as a pre-high-stakes-deployment hardening task in `implementation-plan.md`.

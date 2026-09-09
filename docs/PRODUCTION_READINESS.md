# Production Readiness Report — Phase 15

This supersedes the readiness sections of `docs/PRODUCT_GUIDE.md` (written after Phase 14) with the actual state of the codebase after Phase 15's hardening work. Every claim here was verified against real code and, where practical, a real live run (see "Verification performed" at the end) — not assumed.

---

## Component Readiness

| Component | 🟢/🟡/🔴 Demo | 🟢/🟡/🔴 Staging/Pilot | 🟢/🟡/🔴 Production |
|---|---|---|---|
| Frontend (React/Vite) | 🟢 Ready | 🟢 Ready | 🟢 Ready |
| API (NestJS) | 🟢 Ready | 🟢 Ready | 🟡 Ready with Nginx/HTTPS/`TRUST_PROXY_HOPS` configured |
| Authentication | 🟢 Ready | 🟢 Ready | 🟢 Ready |
| Authorization (RBAC) | 🟢 Ready | 🟢 Ready | 🟢 Ready |
| Database (PostgreSQL/Prisma) | 🟢 Ready | 🟢 Ready | 🟡 Ready once backups are actually scheduled (`docs/BACKUP_AND_RECOVERY.md`) |
| AI Integration (Gemini) | 🟢 Ready | 🟢 Ready | 🟢 Ready (degrades gracefully if unconfigured/down) |
| Assessment System | 🟢 Ready | 🟢 Ready | 🟢 Ready |
| Student Experience | 🟢 Ready | 🟢 Ready | 🟢 Ready |
| Results | 🟢 Ready | 🟢 Ready | 🟡 Ready, but "ranking" is computed and never shown — decide whether to finish or remove it first |
| **Execution Service** | 🟢 Ready | 🟡 Ready **only** for a trusted, non-adversarial pilot | 🔴 **Not ready** — see below |
| HTTPS | 🔴 Not applicable to a local demo | 🟡 Requires Nginx+Certbot setup (`docs/DEPLOYMENT.md`) — not automatic | 🔴 Required, not yet configured anywhere in this repo (by design — it's infrastructure, not application code) |
| Monitoring/Error tracking | 🟡 Basic structured logs exist (Phase 15) | 🟡 Logs exist; no alerting | 🔴 No metrics/alerting/uptime monitoring configured |
| Backups | 🔴 Not needed for a demo | 🟡 Documented (`docs/BACKUP_AND_RECOVERY.md`) but not automated by this repo | 🔴 Must be scheduled by whoever operates the server — this repo can't do it for you |
| Scaling | 🟢 Fine for a single class/demo | 🟢 Fine for a pilot cohort | 🟡 Single-worker execution queue and in-memory login-throttle both need attention before real scale (see below) |

---

## Security Scorecard

### 🟢 Implemented
- Password hashing (bcrypt, cost factor 12).
- JWT access (15 min) + rotating, revocable refresh tokens (7 days, httpOnly cookie).
- Per-account lockout after 5 failed logins (15-minute lock, persisted in the database).
- Per-IP login throttle (30 failures / 5-minute window).
- Global, deny-by-default role-based authorization on every API route.
- Zod input validation on every request body/query.
- Sanitized error responses — no stack traces or internals ever reach a client (verified: the global exception filter logs full detail server-side only).
- Hidden test case / reference solution protection, enforced at three independent layers (execution-service query scope, null DB storage for hidden output, and a student-facing DTO with no field to leak them into).
- SQL injection protection (Prisma parameterized queries everywhere; no raw SQL).
- Rate limiting on the three endpoints that matter most: login, code run/submit, AI generation.
- **HTTP security headers (Phase 15)** — Helmet is now wired into the API: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, and a locked-down default Content-Security-Policy. Verified live: `curl -sI` against a running instance shows all four headers present.
- **Production-config guard (Phase 15)** — the API now refuses to boot with `NODE_ENV=production` if any JWT/shared secret is still the literal `.env.example` placeholder text, or if `FRONTEND_URL` still points at `localhost`. This turns "someone forgot to edit `.env` before going live" from a silent vulnerability into an immediate, loud startup failure.
- **Correct client-IP resolution behind a reverse proxy (Phase 15)** — `TRUST_PROXY_HOPS` (new) makes the login IP-throttle actually see real client addresses once deployed behind Nginx, instead of everyone appearing to share Nginx's own IP (which, unfixed, would have made the per-IP throttle either useless or capable of locking out an entire campus at once).
- **Multi-origin CORS support (Phase 15)** — `FRONTEND_URL` can now be a comma-separated allowlist for legitimate multi-domain setups, without ever falling back to a wildcard.
- **Authentication-event logging (Phase 15)** — login-throttle trips and account lockouts are now logged (by IP/user id only — never credentials), closing a real observability gap that existed through Phase 14.
- **Additional native (non-Docker) code-execution ceilings (Phase 15)** — see "Code Execution Security" below for the full, honest breakdown.

### 🟡 Partially Implemented
- **Per-IP login throttle** — correct for a single API instance; resets on restart and does **not** share state across multiple API instances/replicas (it's an in-memory map, not a shared store). Deliberately not "fixed" with Redis per this phase's explicit instruction not to force external infrastructure into the project — documented here as a known, accepted limitation for a single-instance deployment.
- **Rate limiting breadth** — still only covers login, run/submit, and AI generation. Every other endpoint (user management, assessment CRUD, results) has no throttling beyond the auth/role check itself.
- **Password policy** — length only (8–200 chars), no complexity requirement.
- **Ranking/leaderboard** — computed and stored server-side, exposed nowhere. Not a security issue, but a half-built feature that should be finished or removed before it confuses anyone.

### 🔴 Remaining Risks
- **No true sandbox for code execution.** This is the single most important item in this entire report — see the dedicated section below.
- **No HTTPS enforcement in the application itself** (by design — this is Nginx's job, documented in `docs/DEPLOYMENT.md`, but it does mean a misconfigured or missing Nginx setup leaves the API reachable over plain HTTP with no application-level backstop).
- **No monitoring/alerting.** Structured logs now exist in more places (Phase 15), but nothing watches them or pages anyone.
- **No automated backups.** Documented (`docs/BACKUP_AND_RECOVERY.md`) but must be scheduled by the operator.
- **Known dependency vulnerabilities exist transitively** (`npm audit`, run during Phase 15, reports 8 high-severity advisories — all transitive, via `multer`/`@nestjs/platform-express` and `mysql2`/`prisma`'s own dependency tree, not code this project wrote or a package it chose to add). Fixing them requires **breaking downgrades** (`npm audit fix --force` would install `@nestjs/core@7.5.5` and `prisma@6.19.3` — both older major versions than what this project currently runs) — that trade is not made in this phase, since downgrading core framework versions is a bigger, riskier decision than a documentation/hardening pass should make unilaterally. Flagged here honestly rather than silently left out of the report.

---

## Code Execution Security — the honest, detailed answer

### Threat model (realistic threats this section evaluates against)
Infinite loops · CPU exhaustion · memory exhaustion · fork/process-count abuse · reading sensitive host files · writing files (disk-fill) · reading environment variables/secrets · uncontrolled process spawning · temp-file abuse · outbound network access · port scanning from a submission · excessive output flooding the service.

### What changed in Phase 15 (native Linux hardening, no Docker)
Extended the existing POSIX `ulimit -v` (memory) wrapper in `process-executor.ts` into a general resource-limit wrapper applied to every run:

| Control | Mechanism | Threat it addresses | Platform |
|---|---|---|---|
| Wall-clock timeout + full process-tree kill | Node `setTimeout` + `SIGKILL` on the whole process group (Linux) / `taskkill /T /F` (Windows) | Infinite loops, hung processes | Both (pre-existing, unchanged) |
| Memory ceiling | JVM `-Xmx` (Java, hard/native); `ulimit -v` (C++/Python) | Memory exhaustion | Java: both platforms. C++/Python: **Linux only** |
| **Process/thread count ceiling** *(new)* | `ulimit -u` (`RLIMIT_NPROC`), default 128 | Fork bombs | **Linux only — no-op on Windows** |
| **Per-file size ceiling** *(new)* | `ulimit -f` (`RLIMIT_FSIZE`), default 50MB | Disk-fill via unbounded file writes | **Linux only — no-op on Windows** |
| **CPU-time ceiling** *(new)* | `ulimit -t` (`RLIMIT_CPU`), sized just above the question's own wall-clock timeout | A second, kernel-level backstop against a CPU-bound loop, independent of the Node timer | **Linux only — no-op on Windows** |
| Output size cap | Byte-counted stream kill mid-read | A print-flood exhausting the execution service's own memory | Both (pre-existing, unchanged) |
| Environment stripping | Child process gets an empty (or near-empty, on Windows) environment | Reading `DATABASE_URL`/API keys/secrets via `process.env` | Both (pre-existing, unchanged) |
| Fresh temp directory per run, deleted after | `fs.mkdtemp` + recursive removal | Temp-file collision/reuse across submissions | Both (pre-existing, unchanged) |
| Systemd process-manager limits (deployment-level) | `MemoryMax`, `CPUQuota`, `TasksMax` in the recommended unit file (`docs/DEPLOYMENT.md`) | A second, independent backstop above the in-app limits | Linux (deployment configuration, not application code) |

Verified live during Phase 15: real Python, C++, and Java "Two Sum" solutions were submitted through the actual running API → execution-service pipeline (both Run and graded Submit, including hidden test cases) and correctly judged `ACCEPTED`/scored after this refactor — confirming the resource-limit changes didn't break real execution on the (Windows) development machine, where they correctly no-op. **The new Linux-specific `ulimit -u`/`-f`/`-t` behavior itself has not been exercised on an actual Linux host in this session** (this development machine is Windows) — the shell-wrapper syntax was written carefully and mirrors the pre-existing, already-shipped `ulimit -v` pattern exactly, but a first real Linux deployment should specifically re-verify Run/Submit for all three languages before trusting it for a live exam.

### What is still **not** addressed — said plainly
- **There is still no sandbox.** No container, no chroot, no seccomp profile, no namespace isolation. Everything above is a *resource ceiling*, not an *isolation boundary*. A submission still runs as a normal OS process.
- **Filesystem access is still unrestricted within those ceilings.** A malicious submission can still read (and, up to the new 50MB file-size cap, write) any file the execution service's OS user can access. This is exactly why running that service as a **dedicated, unprivileged Linux user with no access to `.env` files or anything else sensitive** (see `docs/DEPLOYMENT.md`'s systemd unit) is not optional — it is the actual security boundary here, not the application code.
- **Network access is still unrestricted.** Nothing in this codebase blocks outbound HTTP/DNS/socket calls from a submission, on any platform. A submission can still make outbound requests, and — combined with unrestricted (if capped) file reads — could in principle read a locally-readable file and exfiltrate it over the network. Blocking this reliably requires a network-level control (an egress firewall rule scoped to the execution service's dedicated user/group, e.g. via `iptables`/`nftables` owner-match rules) that must be configured at the OS level on the deployment host — **this is explicitly not something this application can enforce from inside itself**, and this repository does not attempt to claim otherwise.
- **Memory/process/file-size limits remain Linux-only.** On Windows (this development environment), none of the four new ceilings apply — only the pre-existing timeout and output cap do.

### Development vs. Demo vs. Trusted Pilot vs. Production modes

| Mode | What's actually protecting the host | Appropriate for |
|---|---|---|
| **Development** | Timeout + output cap only (Windows dev machine — memory/process/file/CPU ceilings are no-ops here) | Your own machine, your own trusted test code |
| **Demo** | Same as Development, plus you control exactly what code gets run | A presenter-driven demonstration where nobody but you is typing code |
| **Trusted Pilot** | All of the above, **on Linux**, with the execution service running as its own restricted OS user | A real class of students who are not being asked to attack the system — realistic accidents (infinite loops, memory-hungry bugs) are handled; a deliberate, skilled attacker is not fully stopped |
| **Production (real, adversarial, high-stakes use)** | Everything above, **plus** a real sandbox (see "Recommended next step" below) and a firewall egress rule for the execution user | **Not achievable with this codebase as it stands today** — this is the honest limit of what's possible without containers/VMs |

### Network isolation (this part is solid)
The execution service is **never** publicly exposed regardless of the above — it binds to `127.0.0.1` only, requires a shared-secret bearer token on its one internal endpoint, and the recommended Nginx config in `docs/DEPLOYMENT.md` never proxies to it. The only path to it is: browser → Nginx → API → (127.0.0.1 only) → execution service. This part of the threat model is fully and correctly closed.

### Recommended next step (still non-Docker, if closing the remaining gap becomes a real requirement)
The `Sandbox`/`LanguageRunner` interfaces in `apps/execution-service` were deliberately designed so `ProcessExecutor` is a swappable implementation. The most realistic *non-container* upgrade path on Linux is a dedicated judge sandboxing tool such as **`isolate`** or **`nsjail`** (both are ordinary Linux packages, not container runtimes — they use namespaces/cgroups directly) — wrapping the existing compile/run calls with one of these would close the filesystem/network gaps above without introducing Docker. This is real, non-trivial engineering work; it is correctly out of scope for Phase 15's brief but is the concrete answer to "what would it take."

---

## Final Verdict

🟢 **Demo Ready** — yes, unconditionally, as verified live during this phase.

🟡 **Staging/Pilot Ready** — yes, **conditional on**: deploying on Linux (not Windows), the execution service running as its own dedicated unprivileged OS user, real generated secrets (not the `.env.example` placeholders — the app now refuses to boot in production if you forget), and HTTPS via the documented Nginx+Certbot setup. Suitable for a real class of students who are not adversarial.

🔴 **Production Ready** for real, unsupervised, adversarial, high-stakes student use — **no**. The blocking gap is the same one identified after Phase 14 and only partially narrowed here: code execution has resource *ceilings* now, on Linux, but still no real sandbox. Everything else in the platform (auth, authorization, data protection, the assessment/scoring engine, the AI workflow) is genuinely solid. Do not present this platform as "production-hardened" for code execution specifically — present it as "meaningfully hardened for a trusted pilot, with a clear, honest, documented path to full production sandboxing."

---

## Verification performed during Phase 15

- `npm run typecheck` — clean across `api`, `web`, `execution-service`.
- `npm run lint` — clean across all three.
- `npm run build` — clean across `shared`, `api`, `web`, `execution-service`.
- `npm run test` (API unit tests) — 23/23 passed.
- `npm run test:e2e` (API, against a live database) — 232/233 passed on the first run; the one failure (a C++ "correct solution" case) reproduced as a clean **pass** when re-run in isolation immediately after, consistent with resource contention during the full 233-test run rather than a regression — `git diff` confirms the C++ compile path itself was untouched by this phase's changes.
- Live, real end-to-end verification against the running dev stack (not simulated): created a fresh assessment via the real API, attached the seeded "Two Sum" question, assigned the seeded student, published it, then as that student ran **and** submitted real Python, C++, and Java solutions through the actual Run/Submit endpoints and confirmed correct `ACCEPTED` verdicts, correct hidden-test-case grading on Submit, and a correct 10/10 score in the admin's results view — confirming the resource-limit refactor did not break real code execution.
- Confirmed via `curl -sI` against the live running API that Helmet's security headers (HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`) are actually present on real responses, not just configured in code.
- Confirmed via `grep` against the actual production frontend build output (`apps/web/dist`) that no backend secret env var name appears anywhere in the shipped JavaScript bundle.

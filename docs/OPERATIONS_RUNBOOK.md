# Operations Runbook — Centurion Technical Assessment Platform

A practical reference for whoever is keeping this server running day-to-day. Assumes the systemd-based deployment described in `docs/DEPLOYMENT.md` (services named `technical-platform-api` and `technical-platform-exec`).

---

## Start / stop / restart services

```bash
# Start (also happens automatically on boot, since both are `enable`d)
sudo systemctl start technical-platform-api
sudo systemctl start technical-platform-exec

# Stop
sudo systemctl stop technical-platform-api
sudo systemctl stop technical-platform-exec

# Restart (e.g. after a deploy, or picking up a changed .env)
sudo systemctl restart technical-platform-api
sudo systemctl restart technical-platform-exec

# Is it actually running right now?
sudo systemctl status technical-platform-api
sudo systemctl status technical-platform-exec
```

Nginx is a separate, standard system service — `sudo systemctl restart nginx` after any config change (`sudo nginx -t` first to check the config is valid before reloading it).

## Check logs

```bash
journalctl -u technical-platform-api -f              # follow live
journalctl -u technical-platform-exec -f
journalctl -u technical-platform-api --since "1 hour ago"
journalctl -u technical-platform-api --since "2026-09-09 08:00" --until "2026-09-09 09:00"
journalctl -u technical-platform-api -p err           # errors only
```

What to actually look for (per the structured logging added in Phase 15 — see `docs/PRODUCTION_READINESS.md` for the full list):
- `[LoginThrottleService] Login throttle active for IP ...` — a credential-guessing burst from one address.
- `[LocalIdentityProvider] Account ... locked until ...` — an account got locked out (5 wrong passwords).
- `[QuestionGenerationService] AI generation failed for admin ...` / `[GeminiProvider] Gemini generation attempt ... failed: ...` — an AI generation request failed (see "Gemini troubleshooting" below).
- `[ExceptionFilter] Unhandled exception` — a genuine unexpected server error; the full stack trace is logged here (server-side only, never sent to any client) and is the first thing to read for an unexplained 500.
- Execution-service log lines prefixed `[execution-service] ... Job ... failed ...` — a code-execution job that hit a sandbox/infra problem (see "Execution troubleshooting" below).

## Check health

```bash
curl -s https://<your-domain>/api/v1/health | python3 -m json.tool
curl -s http://127.0.0.1:4100/health | python3 -m json.tool   # run ON the server, not exposed publicly
```

Both should return `"status": "ok"` and `"db": "connected"`. A `503`/`"status": "degraded"` on either means the *process* is up but it can't reach PostgreSQL — see "Database troubleshooting."

If a request to the API times out entirely (not even an error response), the process itself is likely down — check `systemctl status` and the logs above.

---

## API troubleshooting

**Symptom: 502/504 from Nginx on `/api/v1/...`.**
1. `sudo systemctl status technical-platform-api` — is it running?
2. `journalctl -u technical-platform-api --since "10 min ago"` — did it crash, and why? A missing/invalid required env var (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EXECUTION_SERVICE_SHARED_SECRET`) makes the process refuse to start at all — the error message names exactly which variable is the problem (`env.schema.ts`'s `validateEnv` is designed to fail loudly, not silently).
3. If it started fine but is unresponsive, `sudo systemctl restart technical-platform-api` and re-check.

**Symptom: every login fails with `RATE_LIMITED` for everyone, all the time.**
- This is the classic symptom of `TRUST_PROXY_HOPS` being misconfigured relative to Nginx — if the API can't see real client IPs, every request from behind Nginx can appear to share one IP, and 30 failures from *anyone* trips the shared-IP throttle for *everyone*. Fix: confirm `TRUST_PROXY_HOPS=1` in the API's `.env` and that Nginx sets `X-Forwarded-For` (see the Nginx config in `docs/DEPLOYMENT.md`), then restart the API.

**Symptom: CORS errors in the browser console.**
- Confirm `FRONTEND_URL` in the API's `.env` exactly matches the origin the browser is actually loading from (protocol + host, not just the domain — `https://exams.centurion.example` ≠ `http://exams.centurion.example`). Restart the API after changing it.

## Database troubleshooting

**Symptom: health check shows `"db": "error"`.**
1. Is PostgreSQL itself running? `sudo systemctl status postgresql`.
2. Can you connect manually? `psql "$DATABASE_URL"` — a connection refused/timeout points at PostgreSQL or network/firewall; an authentication error points at a wrong password/role in `DATABASE_URL`.
3. Check PostgreSQL's own logs (path varies by distro, commonly `/var/log/postgresql/`).
4. Once the database is confirmed reachable again, restart both application services so their connection pools reconnect cleanly: `sudo systemctl restart technical-platform-api technical-platform-exec`.

**Symptom: a migration failed mid-deploy.**
- Do not improvise a fix by hand-editing the schema. Restore from the pre-deploy backup (`docs/BACKUP_AND_RECOVERY.md`) and re-attempt the deploy, or get the exact `prisma migrate deploy` error to whoever wrote the migration before touching production data further.

## Execution (code-judging) troubleshooting

**Symptom: every Run/Submit comes back `INTERNAL_ERROR` / "please try again."**
1. `journalctl -u technical-platform-exec --since "10 min ago"` — the poller logs the real underlying error for every job it can't complete (`Job ... failed permanently: ...`).
2. Most common cause: a misconfigured toolchain path. Confirm `CPP_COMPILER_PATH`, `JAVA_HOME` (or `JAVAC_PATH`/`JAVA_PATH`), and `PYTHON_PATH` in the execution service's `.env` actually point at real, executable binaries on this host — `which g++`, `which javac`, `which python3` (or the equivalent under whatever user runs the service — remember it's a *different*, unprivileged user; confirm that specific account can execute those binaries).
3. Confirm the execution service's own DB connection is healthy (`curl http://127.0.0.1:4100/health`).

**Symptom: everything for one specific language fails, others are fine.**
- Isolate to that language's toolchain specifically (see above) — this is essentially never a bug in all three languages at once given they share the same poller/queue infrastructure.

**Symptom: submissions are slow / a backlog is building up during a live exam.**
- Expected under load by design: the execution service processes **one job at a time** (see `docs/PRODUCT_GUIDE.md` §8 and `docs/PRODUCTION_READINESS.md`). If a class-wide exam consistently produces a backlog, that's the signal to add a **second execution-service worker process** (the job queue already supports safe concurrent claiming — this is a scaling change, not a bug fix) rather than trying to speed up any single job.

## Gemini (AI generation) troubleshooting

**Symptom: "AI provider not configured" for every generation attempt.**
- `GEMINI_API_KEY` is blank/unset in the API's `.env`. This is not a bug — the app is designed to run fine without it; add a real key and restart the API to enable the feature.

**Symptom: generation intermittently fails with a rate-limit or "temporarily unavailable" message.**
- Check `journalctl -u technical-platform-api` for the specific Gemini error code (`AI_RATE_LIMITED`, `AI_PROVIDER_UNAVAILABLE`, `AI_TIMEOUT` — all logged per-attempt by `GeminiProvider`). These already retry automatically up to 3 times; a persistent failure after retries usually means the actual Gemini API quota/outage, not something to fix locally. Wait and retry, or check Google's own status page.

**Symptom: "The configured Gemini API key was rejected."**
- The key itself is invalid/revoked — this one is never retried automatically (it can't succeed by retrying). Generate a new key and update `.env`.

## High CPU troubleshooting

1. `top`/`htop` on the server — is it the API, the execution service, or a runaway *student* process (compiler/interpreter) consuming it?
2. If it's a student process: this is exactly the scenario the Phase 15 hardening (wall-clock timeout + tree-kill, and — on Linux — the `ulimit -t` CPU-time ceiling in `process-executor.ts`) exists for. It should self-resolve within the question's configured time limit plus a couple of seconds. If a process is still consuming CPU well past that, treat it as a bug report (capture the submission's language/code if possible) rather than something to fix by hand — killing it manually (`kill -9 <pid>`) is safe in the moment but doesn't address why the automatic timeout didn't fire.
3. If it's the API or execution-service process itself sustaining high CPU with no exam in progress, that's unusual — check logs for a tight retry loop (e.g. a database connection repeatedly failing and retrying) before assuming it's normal load.

## High memory troubleshooting

1. Check which process: `ps aux --sort=-%mem | head`.
2. A student's program hitting its memory ceiling should be killed by the enforcement in place for its language (JVM `-Xmx` always; `ulimit -v` on Linux for C++/Python — see `docs/PRODUCTION_READINESS.md` for exactly what is and isn't enforced on which platform) and reported back as `MEMORY_LIMIT_EXCEEDED`, not left running.
3. If the **execution-service process itself** is growing memory over time (a leak, not a single student job), the systemd `MemoryMax` limit in `docs/DEPLOYMENT.md`'s unit file will eventually have systemd kill and restart it (`Restart=on-failure`) rather than let it take down the whole host — check `journalctl -u technical-platform-exec` for an OOM-kill message from systemd/the kernel as confirmation, and treat repeated occurrences as a bug to investigate, not a steady state to tune around.

## Emergency execution-service shutdown

If code execution needs to be stopped immediately (e.g. a suspected active abuse attempt, or a runaway resource problem that isn't self-resolving):

```bash
sudo systemctl stop technical-platform-exec
```

**Effect**: Run/Submit requests from students will queue in the database (`execution_jobs` stays `QUEUED`) and simply never complete — students see "queued"/pending, not an error, until the service comes back. **Nothing is lost** — this is exactly the same state as a temporary outage, which the architecture already tolerates by design (the job queue is durable in Postgres, not in-memory). The API and frontend keep working normally for everything except actually running code.

To resume: `sudo systemctl start technical-platform-exec` — it will immediately start draining the backlog that queued up while it was stopped.

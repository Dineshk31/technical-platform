# Backup & Recovery — Centurion Technical Assessment Platform

## What actually needs backing up

This platform has exactly **one** stateful store: **PostgreSQL**. There is no separate file storage, no uploaded-file bucket, no in-app object store — every piece of real data (accounts, questions, test cases, reference solutions, assessments, attempts, submissions, results, AI generation history) lives in that one database. Confirmed by inspecting `apps/api/prisma/schema.prisma`: there is no `File`/`Upload`/`Attachment` model anywhere.

That means backup strategy for this product is, in practice, **backup strategy for one PostgreSQL database**, plus two small pieces of configuration that live outside it:

| What | Where it lives | Backup approach |
|---|---|---|
| All application data | PostgreSQL (`technical_platform` database) | `pg_dump` (see below) |
| `apps/api/.env`, `apps/execution-service/.env` | The server's filesystem only — never in git | See "Configuration recovery" below |
| Application code | Git | Already versioned; not a "backup" concern in the traditional sense — redeploy from the repository |

Nothing here should ever be backed up by copying `.env` files into the same place as your database dumps or your source control — see below.

---

## PostgreSQL backup recommendations

**Tool**: `pg_dump`, the standard PostgreSQL logical backup tool. No third-party service is required for this to work correctly; a managed Postgres provider's own automated snapshots are also acceptable if you host there instead of a self-managed instance.

```bash
# A single, restorable, compressed dump
pg_dump --format=custom --file=technical_platform_$(date +%Y%m%d_%H%M%S).dump \
  --dbname="technical_platform" --host=<db-host> --username=<db-user>
```

- Use `--format=custom` (not plain SQL) — it compresses automatically and allows selective/parallel restore later.
- Store the dump **off the same server** as the database (a separate host, or object storage) — a backup that lives only on the machine it's protecting against doesn't protect against that machine failing.
- Encrypt dumps at rest if they leave a secured environment (they contain real student names, emails, and exam content) — e.g. `gpg --encrypt` the dump file before shipping it off-host.

## Backup frequency

There is no built-in scheduler for this in the application — set up a cron job (or your hosting provider's scheduled-snapshot feature) yourself:

- **During active exam periods**: a more frequent cadence (e.g. every 1–4 hours) is worth the extra storage cost — a lost hour of exam data during a live assessment window is a much bigger problem than a lost hour on a quiet day.
- **Otherwise**: once daily is a reasonable baseline for a university pilot/small deployment.
- **Retention**: keep at least the last 7 daily backups plus a few longer-interval ones (e.g. weekly for a month, monthly for a semester) so an error discovered days later can still be recovered from.

Example cron entry (daily at 2 AM, adjust paths):
```
0 2 * * * pg_dump --format=custom --file=/backups/technical_platform_$(date +\%Y\%m\%d).dump --dbname=technical_platform >> /var/log/technical-platform-backup.log 2>&1
```

## Restore procedure

```bash
# Into a NEW, empty database — never restore over a live one without a plan
createdb technical_platform_restore_test
pg_restore --dbname=technical_platform_restore_test --clean --if-exists technical_platform_20260909.dump
```

To actually recover a production database from a disaster:
1. Stop the API and execution service (`sudo systemctl stop technical-platform-api technical-platform-exec`) — nothing should be writing to the database during a restore.
2. Restore into the real database: `pg_restore --dbname=technical_platform --clean --if-exists <dump file>`.
3. Run `npm run prisma:generate` and confirm `npm run prisma:deploy` reports "already up to date" — if the restored dump predates a migration that's since been deployed, you'll need to re-run that migration.
4. Start the services back up and run the Post-Deployment Verification checklist in `docs/DEPLOYMENT.md`.

## Restore testing

**A backup you've never restored is a hope, not a backup.** Periodically (recommended: at least once per semester, and immediately after any major schema change):
1. Restore the most recent dump into a throwaway database (as above, `_restore_test`).
2. Point a local copy of the API at it and confirm the app boots and basic queries work (e.g. log in as an existing seeded admin, list assessments).
3. Drop the throwaway database when done.

This catches problems (a corrupted dump, a version mismatch, a missing extension) long before you'd actually need the backup for real.

## Recovery priorities

If you can only restore one thing first, in order of what breaks the platform hardest if missing:
1. **`users`, `roles`** — nobody can log in without these.
2. **`questions` and its detail tables** (`coding_questions`, `mcq_questions`, test cases, reference solutions) — the question bank itself.
3. **`assessments`, `assessment_sections`, `assessment_questions`, `assessment_participants`** — what's scheduled and who's assigned.
4. **`attempts`, `submissions`, `submission_test_results`, `mcq_responses`, `results`** — the actual exam activity and outcomes. Losing recent rows here (e.g. the last hour before a crash) is the most likely real-world loss scenario and the reason for the "backup more often during live exams" guidance above.
5. **`ai_generation_requests`** — audit history only; losing this doesn't affect anyone's ability to use the platform, only the historical record of past AI generations.

In practice a full-database `pg_restore` recovers everything together — this ordering matters mainly for understanding *impact* if a partial/older backup is all that's available, not for deciding what to restore first mechanically.

## Configuration recovery

`.env` files are **deliberately never committed to git** (confirmed by this repository's own `.gitignore`) and are therefore **not covered by a database backup at all**. If the server hosting them is lost, they must be recreated from:
- The checked-in `.env.example` files (structure/variable names — safe placeholders only, never real secrets).
- Wherever your team actually stores the real secret values — this should be a password manager or a proper secrets manager (e.g. your cloud provider's secrets service, HashiCorp Vault, or at minimum an encrypted, access-controlled vault), **never** a plaintext copy sitting next to database dumps or in a chat message. This project does not prescribe a specific tool — pick one your team already trusts — but it must exist somewhere before you need it, not be reconstructed from memory during an outage.

Losing the JWT secrets specifically just means every existing logged-in session becomes invalid (users log in again) — it is not catastrophic. Losing `EXECUTION_SERVICE_SHARED_SECRET` requires regenerating it identically in both `.env` files (they must match exactly) and restarting both services.

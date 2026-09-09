import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { Env } from '../config/env.js';
import type { JobPoller } from '../worker/poller.js';

// Phase 15 — a DB-down check must never hang a health probe indefinitely (a load
// balancer/systemd watchdog calling this on a fixed interval needs a bounded reply
// either way), so the readiness ping below races against this timeout.
const HEALTH_DB_TIMEOUT_MS = 2000;

/**
 * A minimal internal-only HTTP surface (docs/coding-engine.md §3, §5): bound
 * to 127.0.0.1 so it is never reachable from outside this host, and every
 * request must present the shared secret both processes hold. This is a
 * latency optimization only — if the API's notify call never arrives (network
 * hiccup, this service briefly down), the interval poller in `JobPoller`
 * still drains the queue on its own; nothing is ever lost, only delayed.
 */
export function createInternalServer(env: Env, poller: JobPoller, pool: Pool, log: (msg: string) => void) {
  const server = createServer((req, res) => {
    void handleRequest(req, res, env, poller, pool, log);
  });
  return server;
}

/**
 * Phase 15 — distinguishes "the process is up and can accept HTTP" (always true if
 * this handler runs at all) from "the critical dependency (Postgres) is actually
 * reachable" (the `db` field), mirroring the API's own `GET /api/v1/health` shape
 * (health.controller.ts) so both services report health consistently. Never
 * returns anything beyond a connectivity boolean and a timestamp — no query
 * results, no connection string, no internal error text.
 */
async function checkDb(pool: Pool): Promise<'connected' | 'error'> {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db health check timed out')), HEALTH_DB_TIMEOUT_MS)),
    ]);
    return 'connected';
  } catch {
    return 'error';
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  env: Env,
  poller: JobPoller,
  pool: Pool,
  log: (msg: string) => void,
): Promise<void> {
  if (req.method === 'GET' && req.url === '/health') {
    const db = await checkDb(pool);
    res.writeHead(db === 'connected' ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: db === 'connected' ? 'ok' : 'degraded', timestamp: new Date().toISOString(), db }));
    return;
  }

  if (req.method === 'POST' && req.url === '/internal/execution/notify') {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${env.EXECUTION_SERVICE_SHARED_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing shared secret' } }));
      return;
    }

    // Drain the request body (ignored — the poller re-queries QUEUED jobs itself
    // rather than trusting a job id supplied over this channel, so a notify call
    // is a pure "wake up and look" signal, robust to being stale or lost).
    req.resume();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
    poller.wake().catch((error) => log(`wake() after notify failed: ${String(error)}`));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
}

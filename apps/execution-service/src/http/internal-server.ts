import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Env } from '../config/env.js';
import type { JobPoller } from '../worker/poller.js';

/**
 * A minimal internal-only HTTP surface (docs/coding-engine.md §3, §5): bound
 * to 127.0.0.1 so it is never reachable from outside this host, and every
 * request must present the shared secret both processes hold. This is a
 * latency optimization only — if the API's notify call never arrives (network
 * hiccup, this service briefly down), the interval poller in `JobPoller`
 * still drains the queue on its own; nothing is ever lost, only delayed.
 */
export function createInternalServer(env: Env, poller: JobPoller, log: (msg: string) => void) {
  const server = createServer((req, res) => {
    void handleRequest(req, res, env, poller, log);
  });
  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  env: Env,
  poller: JobPoller,
  log: (msg: string) => void,
): Promise<void> {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
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

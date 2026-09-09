import 'dotenv/config';
import { loadEnv, resolveToolchain } from './config/env.js';
import { createPool } from './db/pool.js';
import { createInternalServer } from './http/internal-server.js';
import { JobPoller } from './worker/poller.js';

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[execution-service] ${new Date().toISOString()} ${msg}`);
}

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const toolchain = resolveToolchain(env);
  const pool = createPool(env.DATABASE_URL);

  const poller = new JobPoller(pool, env, toolchain, log);
  poller.start();

  // Bound to 127.0.0.1 only — never exposed on a public interface (docs/security.md §5).
  const server = createInternalServer(env, poller, pool, log);
  server.listen(env.PORT, '127.0.0.1', () => {
    log(`listening on http://127.0.0.1:${env.PORT} (poll interval ${env.POLL_INTERVAL_MS}ms)`);
    log(`toolchain: cpp=${toolchain.cpp.compiler} javac=${toolchain.java.javac} java=${toolchain.java.java} python=${toolchain.python.interpreter}`);
  });

  const shutdown = async (signal: string) => {
    log(`received ${signal}, shutting down`);
    poller.stop();
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

await bootstrap();

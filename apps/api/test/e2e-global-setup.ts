import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseName, E2E_EXECUTION_PORT, resolveE2eDatabaseUrl } from './e2e-database.js';

const EXECUTION_SERVICE_DIR = fileURLToPath(new URL('../../execution-service/', import.meta.url));

/**
 * Runs once before the e2e suite: makes sure the isolated test database exists and
 * is on the current schema, seeds roles only (the SEED_* accounts are blanked so no
 * admin/student login or sample question is created there), and starts a private
 * execution-service instance against that same database. Returns the teardown.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const testUrl = resolveE2eDatabaseUrl();
  const dbName = databaseName(new URL(testUrl));

  await ensureDatabaseExists(testUrl, dbName);

  const env = {
    ...process.env,
    DATABASE_URL: testUrl,
    SEED_ADMIN_EMAIL: '',
    SEED_ADMIN_PASSWORD: '',
    SEED_STUDENT_EMAIL: '',
    SEED_STUDENT_PASSWORD: '',
  };
  execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'inherit' });

  const executionService = await startExecutionService(testUrl);
  console.log(`[e2e] using isolated database "${dbName}" and execution service on :${E2E_EXECUTION_PORT}`);

  return async () => {
    executionService.kill();
  };
}

async function ensureDatabaseExists(testUrl: string, dbName: string): Promise<void> {
  const maintenanceUrl = new URL(testUrl);
  maintenanceUrl.pathname = '/postgres';
  maintenanceUrl.search = '';
  const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`[e2e] created test database "${dbName}"`);
    }
  } finally {
    await client.end();
  }
}

async function startExecutionService(testUrl: string): Promise<ChildProcess> {
  if (await isListening(E2E_EXECUTION_PORT)) {
    throw new Error(`e2e: port ${E2E_EXECUTION_PORT} is already in use — stop whatever is on it (a leftover e2e execution service?) and re-run.`);
  }

  // Launched as a single node process (tsx as a loader, not the tsx CLI wrapper)
  // so kill() in teardown actually stops it on Windows too.
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: EXECUTION_SERVICE_DIR,
    env: { ...process.env, DATABASE_URL: testUrl, PORT: String(E2E_EXECUTION_PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`e2e: execution service exited early (code ${child.exitCode}).`);
    if (await isListening(E2E_EXECUTION_PORT)) return child;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('e2e: execution service did not start within 30s.');
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

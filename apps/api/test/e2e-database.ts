import { config as loadDotenv } from 'dotenv';

/**
 * The execution service writes verdicts straight into the database it's configured
 * with, so the e2e run needs its own instance pointed at the test database — the
 * dev instance on :4100 would never see test-DB submissions (and must not).
 */
export const E2E_EXECUTION_PORT = 4199;
export const E2E_EXECUTION_URL = `http://127.0.0.1:${E2E_EXECUTION_PORT}`;

/**
 * Resolves the database the e2e suite is allowed to touch — never the dev database.
 *
 * Root cause this fixes (docs/FINAL_PRODUCT_TRANSFORMATION_PLAN.md): ConfigModule
 * reads the same `.env` as `dev:api`, so every e2e run used to write `@test.local`
 * fixture users/assessments straight into the real development data.
 *
 * `TEST_DATABASE_URL` wins when set (CI, or a different server). Otherwise the dev
 * `DATABASE_URL` from `.env` is reused with `_test` appended to the database name —
 * same server and credentials, separate database.
 */
export function resolveE2eDatabaseUrl(): string {
  const fileEnv: Record<string, string> = {};
  loadDotenv({ processEnv: fileEnv, quiet: true });

  const explicit = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;

  let url: URL;
  if (explicit) {
    url = new URL(explicit);
  } else {
    if (!devUrl) throw new Error('e2e: neither TEST_DATABASE_URL nor DATABASE_URL is set.');
    url = new URL(devUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  }

  assertIsTestDatabase(url, devUrl);
  return url.toString();
}

/** Hard stop — the suite must never run against anything that isn't clearly a test DB. */
export function assertIsTestDatabase(url: URL, devUrl?: string): void {
  const dbName = databaseName(url);
  if (!dbName.endsWith('_test')) {
    throw new Error(`e2e: refusing to run against database "${dbName}" — its name must end in "_test".`);
  }
  if (devUrl && sameDatabase(url, new URL(devUrl))) {
    throw new Error(`e2e: refusing to run — the test database "${dbName}" is the same as DATABASE_URL.`);
  }
}

export function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

function sameDatabase(a: URL, b: URL): boolean {
  return a.hostname === b.hostname && (a.port || '5432') === (b.port || '5432') && databaseName(a) === databaseName(b);
}

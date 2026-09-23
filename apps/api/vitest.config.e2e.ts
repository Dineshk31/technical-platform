import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { E2E_EXECUTION_URL, resolveE2eDatabaseUrl } from './test/e2e-database.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Isolated database — see test/e2e-database.ts. Set on the workers' process.env,
    // which ConfigModule gives precedence over the values it reads from `.env`.
    env: { DATABASE_URL: resolveE2eDatabaseUrl(), EXECUTION_SERVICE_URL: E2E_EXECUTION_URL },
    globalSetup: ['./test/e2e-global-setup.ts'],
  },
});

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved CLI configuration (connection URL, seed command) out of
 * schema.prisma and into this file. The runtime PrismaClient gets its
 * connection separately, via a driver adapter — see src/prisma/prisma.service.ts.
 * The explicit dotenv import is needed because, unlike pre-v7 Prisma, the CLI
 * does not appear to auto-load .env before evaluating this config file.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});

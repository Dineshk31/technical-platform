import { z } from 'zod';

/**
 * Every environment variable the API needs to boot. Parsed once at startup
 * (see AppModule's ConfigModule.forRoot({ validate })) so a missing/invalid
 * secret fails fast with a clear message instead of surfacing as a confusing
 * runtime error later. See docs/security.md §5.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Phase 6 — execution-service (docs/coding-engine.md). Bound to 127.0.0.1 on the
  // execution-service side, so this only ever needs to be a loopback URL.
  EXECUTION_SERVICE_URL: z.string().url().default('http://127.0.0.1:4100'),
  EXECUTION_SERVICE_SHARED_SECRET: z.string().min(16, 'EXECUTION_SERVICE_SHARED_SECRET must be at least 16 characters'),
  // Per docs/security.md §7 — no more than one Run/Submit per student per question
  // within this window, to stop a scripted flood from starving the execution queue.
  RUN_RATE_LIMIT_MS: z.coerce.number().int().nonnegative().default(2000),

  // Phase 9 — AI question generation (docs/ai-integration.md). Optional and unvalidated
  // beyond non-emptiness: a deployment that hasn't set up Gemini yet should still boot;
  // GeminiProvider reports AI_PROVIDER_NOT_CONFIGURED per-request instead of failing here.
  // An empty string (e.g. `GEMINI_API_KEY=` left blank in .env) is treated the same as
  // unset, since dotenv parses a blank assignment as `''`, not `undefined`.
  GEMINI_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  // Per-admin throttle on POST /ai/questions/generate (docs/security.md §7), independent
  // of the identical-request dedupe window in QuestionGenerationService.
  AI_GENERATION_RATE_LIMIT_MS: z.coerce.number().int().nonnegative().default(3000),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

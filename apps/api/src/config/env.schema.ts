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

  // Phase 15 — accepts one URL (the original behavior) or a comma-separated list, so
  // one API can serve more than one legitimate frontend origin without a wildcard
  // (config/cors.ts does the actual splitting; validated here only as "at least one
  // non-empty entry that looks like a URL" rather than a single strict `.url()").
  FRONTEND_URL: z
    .string()
    .default('http://localhost:5173')
    .refine(
      (value) => value.split(',').every((origin) => origin.trim().length === 0 || /^https?:\/\/.+/.test(origin.trim())),
      'FRONTEND_URL must be one URL, or a comma-separated list of URLs, each starting with http:// or https://',
    ),

  // Phase 15 — how many hops of `X-Forwarded-For` to trust for the real client IP
  // (Express's `trust proxy` setting; see main.ts). 0 (default) trusts nothing, correct
  // for local dev with no reverse proxy in front. Set to 1 in production once Nginx is
  // the sole direct upstream — see docs/DEPLOYMENT.md. Deliberately capped at 10 so a
  // misconfigured value can't silently trust an unbounded, attacker-controlled header.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

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
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  // Per-admin throttle on POST /ai/questions/generate (docs/security.md §7), independent
  // of the identical-request dedupe window in QuestionGenerationService.
  AI_GENERATION_RATE_LIMIT_MS: z.coerce.number().int().nonnegative().default(3000),
});

export type Env = z.infer<typeof EnvSchema>;

// Phase 15 — the exact placeholder strings shipped in .env.example. Passing basic Zod
// validation (right length, present) is not the same as being a real secret; a
// deployment that copy-pasted .env.example without editing it would otherwise boot
// "successfully" with a publicly-known JWT/shared secret. Checked only when
// NODE_ENV === 'production' — a local/dev/test run is allowed to use these verbatim.
const KNOWN_PLACEHOLDER_VALUES = new Set(['replace-with-a-long-random-secret', 'replace-with-a-different-long-random-secret']);

function assertProductionSafe(env: Env): void {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'EXECUTION_SERVICE_SHARED_SECRET'] as const) {
    if (KNOWN_PLACEHOLDER_VALUES.has(env[key])) {
      problems.push(`${key} is still the .env.example placeholder value — generate a real secret (e.g. \`openssl rand -base64 48\`).`);
    }
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(env.FRONTEND_URL)) {
    problems.push('FRONTEND_URL still points at localhost in a production environment — set it to the real deployed frontend origin(s).');
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to start with NODE_ENV=production and unsafe configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertProductionSafe(parsed.data);
  return parsed.data;
}

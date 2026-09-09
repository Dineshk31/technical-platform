import { z } from 'zod';

/**
 * Every environment variable this service needs. Parsed once at startup so a
 * missing/misconfigured toolchain path fails fast with a clear message
 * instead of surfacing as a confusing INTERNAL_ERROR on the first student
 * submission (docs/coding-engine.md §4 — "resolves toolchain paths from
 * environment variables rather than assuming PATH").
 *
 * DATABASE_URL should, in production, point at the dedicated least-privileged
 * `execution_service` Postgres role described in docs/security.md §4 (grants
 * limited to submissions/submission_test_results/execution_jobs + read-only on
 * coding_questions/coding_test_cases/coding_question_languages) — provisioning
 * that role is a deployment/DBA step, not something this codebase can enforce
 * from the client side, so it is documented here rather than silently assumed.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Shared with apps/api's EXECUTION_SERVICE_SHARED_SECRET — authenticates the
  // internal notify endpoint (docs/security.md §5).
  EXECUTION_SERVICE_SHARED_SECRET: z.string().min(16, 'EXECUTION_SERVICE_SHARED_SECRET must be at least 16 characters'),

  // How often the poller looks for a QUEUED job even without a notify call —
  // the notify HTTP call is purely a latency optimization, this is the
  // guaranteed-progress fallback (docs/coding-engine.md §3).
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),

  // Toolchain resolution — never assume PATH (docs/coding-engine.md §4).
  CPP_COMPILER_PATH: z.string().min(1).default('g++'),
  JAVA_HOME: z.string().optional(),
  JAVAC_PATH: z.string().optional(),
  JAVA_PATH: z.string().optional(),
  // This dev machine's `python3` is a Windows Store alias stub — see docs/architecture.md §0.
  PYTHON_PATH: z.string().min(1).default('python'),

  COMPILE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Added on top of the question's own time_limit_seconds to absorb JVM/interpreter
  // startup cost so a correct solution isn't falsely flagged TIME_LIMIT_EXCEEDED.
  RUNTIME_GRACE_MS: z.coerce.number().int().nonnegative().default(1_000),
  MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(1_000_000),
  MAX_STDIN_BYTES: z.coerce.number().int().positive().default(1_000_000),
  // Phase 15 hardening (docs/DEPLOYMENT.md "Code Execution Security") — kernel-enforced
  // via `ulimit -u`/`ulimit -f` in process-executor.ts, POSIX only, no-op on Windows.
  // MAX_PROCESSES: generous enough that a normal JVM's support threads (GC, JIT, signal
  // dispatcher, etc. — commonly a dozen or so for a trivial program) are never at risk
  // of hitting it, while still bounding a fork-bomb far below anything that could
  // meaningfully strain the host's process table.
  MAX_PROCESSES: z.coerce.number().int().positive().default(128),
  // MAX_FILE_SIZE_KB: bounds any single file the student process writes directly
  // (distinct from MAX_OUTPUT_BYTES, which only caps piped stdout/stderr) — defends
  // against an unbounded write-loop trying to fill the execution host's disk.
  MAX_FILE_SIZE_KB: z.coerce.number().int().positive().default(51_200),
  // Retries only ever apply to INTERNAL_ERROR (sandbox/infra failure), never to a
  // genuine compile/runtime/timeout verdict — docs/coding-engine.md §5.
  MAX_JOB_ATTEMPTS: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid execution-service environment configuration:\n${issues}`);
  }
  return parsed.data;
}

function resolveJavaBin(env: Env, exe: 'javac' | 'java'): string {
  const override = exe === 'javac' ? env.JAVAC_PATH : env.JAVA_PATH;
  if (override) return override;
  if (env.JAVA_HOME) {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    return `${env.JAVA_HOME}/bin/${exe}${suffix}`;
  }
  return exe; // fall back to PATH resolution as a last resort
}

export function resolveToolchain(env: Env) {
  return {
    cpp: { compiler: env.CPP_COMPILER_PATH },
    java: { javac: resolveJavaBin(env, 'javac'), java: resolveJavaBin(env, 'java') },
    python: { interpreter: env.PYTHON_PATH },
  };
}
export type ToolchainConfig = ReturnType<typeof resolveToolchain>;

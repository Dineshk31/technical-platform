import type { ProcessRunResult } from '../process/process-executor.js';
import { sanitizeErrorText } from './sanitize.js';

/**
 * Sandbox execution verdicts. Note this is a superset of the Prisma
 * `submission_status` enum — `OUTPUT_LIMIT_EXCEEDED` has no dedicated column
 * value (docs/database-schema.md was written before this level of detail was
 * needed); the worker maps it to `RUNTIME_ERROR` with an explanatory
 * errorMessage when persisting (see worker/verdict-mapping.ts). Kept distinct
 * here because it's a meaningfully different failure mode worth its own log
 * line and worth not conflating with a genuine student runtime crash upstream
 * of that mapping.
 */
export type SandboxVerdict =
  | 'OK'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface CompileResult {
  success: boolean;
  errorMessage?: string;
  /** True when compilation could not even be attempted (compiler binary not
   * found/EACCES/etc) — an infra problem, not a defect in the student's code.
   * The worker treats this as a retryable INTERNAL_ERROR rather than telling
   * the student their code failed to compile when the real cause is a
   * misconfigured execution host (see docs/coding-engine.md §4's toolchain-path
   * configurability requirement — this is exactly the failure mode it exists
   * to make loud instead of silently mislabeled). */
  internal?: boolean;
}

export interface RunResult {
  verdict: SandboxVerdict;
  stdout: string;
  stderr: string;
  runtimeMs: number;
  /** null where this runner has no reliable way to measure it — see docs/coding-engine.md §6. */
  memoryKb: number | null;
  errorMessage?: string;
}

/**
 * One `LanguageRunner` instance is created fresh per submission (see
 * worker/runner-factory.ts) rather than shared as a singleton, because a
 * runner may need to remember per-submission state between `compile()` and
 * `run()` (e.g. the Java runner's detected public class name) — a shared
 * singleton would make that state a data race if job concurrency is ever
 * raised above 1.
 */
export interface LanguageRunner {
  /** Writes sourceCode into workDir and compiles it. A no-op returning success for interpreted languages. */
  compile(sourceCode: string, workDir: string, timeoutMs: number): Promise<CompileResult>;
  /** Executes the already-compiled artifact (or interprets sourceCode directly) against one test case's stdin. */
  run(workDir: string, stdin: string, timeoutMs: number, maxOutputBytes: number, memoryLimitMb: number): Promise<RunResult>;
}

export function classifyProcessResult(result: ProcessRunResult, workDir: string): RunResult {
  if (result.spawnError) {
    return {
      verdict: 'INTERNAL_ERROR',
      stdout: '',
      stderr: '',
      runtimeMs: result.runtimeMs,
      memoryKb: null,
      errorMessage: 'The execution environment could not start the program.',
    };
  }
  if (result.timedOut) {
    return {
      verdict: 'TIME_LIMIT_EXCEEDED',
      stdout: result.stdout,
      stderr: '',
      runtimeMs: result.runtimeMs,
      memoryKb: null,
    };
  }
  if (result.outputTruncated) {
    return {
      verdict: 'OUTPUT_LIMIT_EXCEEDED',
      stdout: result.stdout,
      stderr: '',
      runtimeMs: result.runtimeMs,
      memoryKb: null,
      errorMessage: 'The program produced more output than the allowed limit.',
    };
  }
  if (result.exitCode !== 0) {
    return {
      verdict: 'RUNTIME_ERROR',
      stdout: result.stdout,
      stderr: result.stderr,
      runtimeMs: result.runtimeMs,
      memoryKb: null,
      errorMessage: sanitizeErrorText(result.stderr || `Process exited with code ${result.exitCode}`, workDir),
    };
  }
  return {
    verdict: 'OK',
    stdout: result.stdout,
    stderr: result.stderr,
    runtimeMs: result.runtimeMs,
    memoryKb: null,
  };
}

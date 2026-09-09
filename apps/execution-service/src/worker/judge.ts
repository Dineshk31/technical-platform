import type { ToolchainConfig } from '../config/env.js';
import { outputsMatch } from '../comparison/output-comparer.js';
import type { TestCaseRow, TestResultInput } from '../db/queries.js';
import type { SubmissionStatusValue } from '../db/types.js';
import { createRunner, type SupportedLanguage } from '../runners/runner-factory.js';
import { withWorkspace } from '../workspace/workspace.js';
import { testCaseStatus, worstStatus } from './verdict-mapping.js';

/** Signals a sandbox/infra failure (never a legitimate student verdict) — the
 * caller retries the whole job up to MAX_JOB_ATTEMPTS before giving up and
 * surfacing INTERNAL_ERROR (docs/coding-engine.md §5). */
export class InternalExecutionError extends Error {}

export interface JudgeParams {
  language: SupportedLanguage;
  code: string;
  testCases: TestCaseRow[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  toolchain: ToolchainConfig;
  compileTimeoutMs: number;
  runtimeGraceMs: number;
  maxOutputBytes: number;
  /** Phase 15 hardening — global execution-service defaults (config/env.ts), applied
   * to every run regardless of language; see RunOptions/ProcessRunOptions for what
   * each one defends against. */
  maxProcesses: number;
  maxFileSizeKb: number;
}

export interface JudgeOutcome {
  status: SubmissionStatusValue;
  testResults: TestResultInput[];
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  errorMessage: string | null;
}

export async function judgeSubmission(params: JudgeParams): Promise<JudgeOutcome> {
  return withWorkspace(async (workDir) => {
    const runner = createRunner(params.language, params.toolchain);

    const compileResult = await runner.compile(params.code, workDir, params.compileTimeoutMs);
    if (compileResult.internal) {
      throw new InternalExecutionError(compileResult.errorMessage ?? 'Compiler unavailable');
    }
    if (!compileResult.success) {
      // docs/coding-engine.md §4: a compile failure skips execution entirely —
      // no stdin is ever run, and (per §5) no per-test-case rows are produced.
      return {
        status: 'COMPILATION_ERROR',
        testResults: [],
        testsPassed: 0,
        testsTotal: params.testCases.length,
        runtimeMs: null,
        memoryKb: null,
        errorMessage: compileResult.errorMessage ?? 'Compilation failed',
      };
    }

    const runTimeoutMs = Math.ceil(params.timeLimitSeconds * 1000) + params.runtimeGraceMs;
    const testResults: TestResultInput[] = [];
    let maxRuntimeMs: number | null = null;
    let maxMemoryKb: number | null = null;

    // Deliberately redundant with the wall-clock `runTimeoutMs` above (see the doc
    // comment on `maxCpuSeconds` in process-executor.ts) — a small fixed buffer over
    // the wall timeout so it only ever fires as a backstop, never before the primary
    // timeout would have anyway.
    const maxCpuSeconds = Math.ceil(runTimeoutMs / 1000) + 2;

    for (const testCase of params.testCases) {
      const runResult = await runner.run(workDir, testCase.input, {
        timeoutMs: runTimeoutMs,
        maxOutputBytes: params.maxOutputBytes,
        memoryLimitMb: params.memoryLimitMb,
        maxProcesses: params.maxProcesses,
        maxFileSizeKb: params.maxFileSizeKb,
        maxCpuSeconds,
      });
      if (runResult.verdict === 'INTERNAL_ERROR') {
        throw new InternalExecutionError(runResult.errorMessage ?? 'Sandbox execution failed');
      }

      const passed = runResult.verdict === 'OK' && outputsMatch(runResult.stdout, testCase.expectedOutput);
      const status = testCaseStatus(runResult.verdict, passed);

      testResults.push({
        testCaseId: testCase.id,
        isHidden: testCase.isHidden,
        status,
        passed,
        actualOutput: testCase.isHidden ? null : runResult.stdout,
        runtimeMs: runResult.runtimeMs,
        memoryKb: runResult.memoryKb,
        errorMessage: runResult.errorMessage ?? null,
        orderIndex: testCase.orderIndex,
      });

      if (runResult.runtimeMs !== null) maxRuntimeMs = Math.max(maxRuntimeMs ?? 0, runResult.runtimeMs);
      if (runResult.memoryKb !== null) maxMemoryKb = Math.max(maxMemoryKb ?? 0, runResult.memoryKb);
    }

    const testsPassed = testResults.filter((t) => t.passed).length;
    const status = worstStatus(testResults.map((t) => t.status));
    const firstFailure = testResults.find((t) => !t.passed && t.errorMessage);

    return {
      status,
      testResults,
      testsPassed,
      testsTotal: testResults.length,
      runtimeMs: maxRuntimeMs,
      memoryKb: maxMemoryKb,
      errorMessage: firstFailure?.errorMessage ?? null,
    };
  });
}

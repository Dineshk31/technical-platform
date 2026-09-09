import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { minimalChildEnv, runProcess } from '../process/process-executor.js';
import { classifyProcessResult, type CompileResult, type LanguageRunner, type RunOptions, type RunResult } from '../sandbox/sandbox.interface.js';

const SOURCE_FILE = 'source.py';

/** No compile step — a syntax error only surfaces once `run()` is attempted, and
 * is reported as a RUNTIME_ERROR (exit code != 0, traceback in stderr), same as
 * every other Python exception. This matches how CPython itself works: there is
 * no separate "compile" phase a student would recognize as distinct from running it. */
export class PythonRunner implements LanguageRunner {
  constructor(private readonly interpreterPath: string) {}

  async compile(sourceCode: string, workDir: string): Promise<CompileResult> {
    await writeFile(join(workDir, SOURCE_FILE), sourceCode, 'utf8');
    return { success: true };
  }

  async run(workDir: string, stdin: string, options: RunOptions): Promise<RunResult> {
    const result = await runProcess({
      command: this.interpreterPath,
      // -B: never write __pycache__ into the throwaway workspace; -I: isolated mode,
      // ignores user site-packages/env vars that could reintroduce environment leakage.
      args: ['-B', '-I', join(workDir, SOURCE_FILE)],
      cwd: workDir,
      input: stdin,
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
      env: minimalChildEnv(),
      // CPython's own interpreter startup + allocator arenas reserve well more virtual
      // address space than a comparable native binary before a student's code runs at
      // all — a tight ulimit -v would falsely OOM-kill correct programs on interpreter
      // boot. This buffer is deliberately generous (docs/coding-engine.md §6: this is a
      // best-effort ceiling, not a precise accounting of the student program's own
      // usage — a no-op on Windows dev machines regardless).
      memoryLimitMb: options.memoryLimitMb + 128,
      maxProcesses: options.maxProcesses,
      maxFileSizeKb: options.maxFileSizeKb,
      maxCpuSeconds: options.maxCpuSeconds,
    });
    const classified = classifyProcessResult(result, workDir);
    if (classified.verdict === 'RUNTIME_ERROR' && /MemoryError/.test(result.stderr)) {
      return { ...classified, verdict: 'MEMORY_LIMIT_EXCEEDED', errorMessage: 'Memory limit exceeded (MemoryError).' };
    }
    return classified;
  }
}

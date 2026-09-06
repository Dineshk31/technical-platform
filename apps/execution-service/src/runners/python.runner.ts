import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { minimalChildEnv, runProcess } from '../process/process-executor.js';
import { classifyProcessResult, type CompileResult, type LanguageRunner, type RunResult } from '../sandbox/sandbox.interface.js';

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

  async run(workDir: string, stdin: string, timeoutMs: number, maxOutputBytes: number): Promise<RunResult> {
    const result = await runProcess({
      command: this.interpreterPath,
      // -B: never write __pycache__ into the throwaway workspace; -I: isolated mode,
      // ignores user site-packages/env vars that could reintroduce environment leakage.
      args: ['-B', '-I', join(workDir, SOURCE_FILE)],
      cwd: workDir,
      input: stdin,
      timeoutMs,
      maxOutputBytes,
      env: minimalChildEnv(),
    });
    return classifyProcessResult(result, workDir);
  }
}

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { minimalChildEnv, runProcess } from '../process/process-executor.js';
import { classifyProcessResult, type CompileResult, type LanguageRunner, type RunResult } from '../sandbox/sandbox.interface.js';
import { sanitizeErrorText } from '../sandbox/sanitize.js';

const SOURCE_FILE = 'source.cpp';
const EXE_FILE = process.platform === 'win32' ? 'program.exe' : 'program';

export class CppRunner implements LanguageRunner {
  constructor(private readonly compilerPath: string) {}

  async compile(sourceCode: string, workDir: string, timeoutMs: number): Promise<CompileResult> {
    const sourcePath = join(workDir, SOURCE_FILE);
    await writeFile(sourcePath, sourceCode, 'utf8');
    const exePath = join(workDir, EXE_FILE);

    const result = await runProcess({
      command: this.compilerPath,
      args: ['-O2', '-std=c++17', sourcePath, '-o', exePath],
      cwd: workDir,
      timeoutMs,
      maxOutputBytes: 200_000,
      // The compiler itself needs enough PATH to find its own internals (cc1plus,
      // linker, etc.) on most installs — this is the compiler's own env, never the
      // student program's env (that is always {} in run(), below).
      env: { PATH: process.env.PATH ?? '' },
    });

    if (result.spawnError) {
      return {
        success: false,
        internal: true,
        errorMessage:
          'The C++ compiler is not available on the execution host. Set CPP_COMPILER_PATH to a valid g++ installation.',
      };
    }
    if (result.exitCode !== 0) {
      return { success: false, errorMessage: sanitizeErrorText(result.stderr || 'Compilation failed', workDir) };
    }
    return { success: true };
  }

  async run(workDir: string, stdin: string, timeoutMs: number, maxOutputBytes: number): Promise<RunResult> {
    const exePath = join(workDir, EXE_FILE);
    const result = await runProcess({
      command: exePath,
      args: [],
      cwd: workDir,
      input: stdin,
      timeoutMs,
      maxOutputBytes,
      env: minimalChildEnv(),
    });
    return classifyProcessResult(result, workDir);
  }
}

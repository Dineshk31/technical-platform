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

  async run(workDir: string, stdin: string, timeoutMs: number, maxOutputBytes: number, memoryLimitMb: number): Promise<RunResult> {
    const exePath = join(workDir, EXE_FILE);
    const result = await runProcess({
      command: exePath,
      args: [],
      cwd: workDir,
      input: stdin,
      timeoutMs,
      maxOutputBytes,
      env: minimalChildEnv(),
      // Small fixed buffer over the question's limit for loader/libc/dynamic-linker
      // overhead that isn't the student's own allocation (docs/coding-engine.md §6 —
      // no equivalent of the JVM's -Xmx exists for a native binary, so this is a
      // kernel-enforced ulimit -v ceiling instead; POSIX only, no-op on Windows).
      memoryLimitMb: memoryLimitMb + 16,
    });
    const classified = classifyProcessResult(result, workDir);
    // ulimit -v exhaustion doesn't produce a clean error like the JVM's OutOfMemoryError —
    // `new` throws std::bad_alloc when malloc returns NULL, which (uncaught) prints a
    // recognizable "terminate called after throwing an instance of 'std::bad_alloc'"
    // line before aborting. Only trust that specific, unambiguous signal — a bare
    // SIGSEGV/SIGABRT is far more often an ordinary student bug (null deref, stack
    // overflow from infinite recursion) than an allocation failure, and mislabeling
    // those as MEMORY_LIMIT_EXCEEDED would actively mislead students about the cause.
    if (classified.verdict === 'RUNTIME_ERROR' && /bad_alloc/.test(result.stderr)) {
      return { ...classified, verdict: 'MEMORY_LIMIT_EXCEEDED', errorMessage: 'Memory limit exceeded (std::bad_alloc).' };
    }
    return classified;
  }
}

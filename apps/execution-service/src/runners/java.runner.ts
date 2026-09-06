import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { minimalChildEnv, runProcess } from '../process/process-executor.js';
import { classifyProcessResult, type CompileResult, type LanguageRunner, type RunResult } from '../sandbox/sandbox.interface.js';
import { sanitizeErrorText } from '../sandbox/sanitize.js';

const DEFAULT_CLASS_NAME = 'Main';

/**
 * Java requires the file a public class lives in to be named after that
 * class. Rather than trust the student to get this right (or silently fail
 * with a confusing javac error), detect the actual class name from the
 * source and write the file to match it — this is also exactly what the
 * shared starter template (`public class Main`) already assumes, so the
 * common case needs no special-casing at all.
 */
export function extractJavaClassName(sourceCode: string): string {
  const publicClass = sourceCode.match(/public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (publicClass) return publicClass[1];
  const anyClass = sourceCode.match(/\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (anyClass) return anyClass[1];
  return DEFAULT_CLASS_NAME;
}

export class JavaRunner implements LanguageRunner {
  private className = DEFAULT_CLASS_NAME;

  constructor(
    private readonly javacPath: string,
    private readonly javaPath: string,
  ) {}

  async compile(sourceCode: string, workDir: string, timeoutMs: number): Promise<CompileResult> {
    this.className = extractJavaClassName(sourceCode);
    const sourcePath = join(workDir, `${this.className}.java`);
    await writeFile(sourcePath, sourceCode, 'utf8');

    const result = await runProcess({
      command: this.javacPath,
      args: ['-d', workDir, '-encoding', 'UTF-8', sourcePath],
      cwd: workDir,
      timeoutMs,
      maxOutputBytes: 200_000,
      env: { PATH: process.env.PATH ?? '' },
    });

    if (result.spawnError) {
      return {
        success: false,
        internal: true,
        errorMessage: 'The Java compiler is not available on the execution host. Set JAVA_HOME or JAVAC_PATH.',
      };
    }
    if (result.exitCode !== 0) {
      return { success: false, errorMessage: sanitizeErrorText(result.stderr || 'Compilation failed', workDir) };
    }
    return { success: true };
  }

  async run(workDir: string, stdin: string, timeoutMs: number, maxOutputBytes: number, memoryLimitMb: number): Promise<RunResult> {
    const result = await runProcess({
      command: this.javaPath,
      args: [`-Xmx${memoryLimitMb}m`, '-XX:+UseSerialGC', '-cp', workDir, this.className],
      cwd: workDir,
      input: stdin,
      timeoutMs,
      maxOutputBytes,
      env: minimalChildEnv(),
    });

    const classified = classifyProcessResult(result, workDir);
    // The JVM's own -Xmx cap is the one *hard*, kernel/VM-enforced memory limit
    // this MVP has (docs/coding-engine.md §4) — C++/Python get no equivalent on
    // Windows dev, documented as a known limitation. Recognize the JVM's own
    // OutOfMemoryError so it surfaces as MEMORY_LIMIT_EXCEEDED rather than a
    // generic RUNTIME_ERROR.
    if (classified.verdict === 'RUNTIME_ERROR' && /OutOfMemoryError/.test(result.stderr)) {
      return { ...classified, verdict: 'MEMORY_LIMIT_EXCEEDED', errorMessage: 'Memory limit exceeded (java.lang.OutOfMemoryError).' };
    }
    return classified;
  }
}

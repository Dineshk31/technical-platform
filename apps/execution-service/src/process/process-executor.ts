import { spawn } from 'node:child_process';

/**
 * The one place a child process is spawned. Every caller (compile step, run
 * step, for every language) goes through this so timeout, output-cap, and
 * kill semantics are enforced identically everywhere — see
 * docs/coding-engine.md §3: never `exec`/`shell: true`, arguments are always
 * passed as an array (no shell interpolation of student-controlled strings),
 * and student code is always written to a file first, never passed as a
 * command-line string.
 */
export interface ProcessRunOptions {
  command: string;
  args: string[];
  cwd: string;
  /** Piped to stdin, then the stream is closed. Undefined means no stdin at all. */
  input?: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /**
   * Explicit replacement for the child's environment. Defaults to `{}` — an
   * empty environment — so nothing from this process (DATABASE_URL, the
   * shared secret, PATH, etc.) is ever visible to student code
   * (docs/security.md §4). Pass a real PATH only where a toolchain genuinely
   * needs it to find its own internals (e.g. `javac`/`java` sometimes need
   * ambient PATH entries beyond their own binary).
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Kernel-enforced virtual-memory ceiling (via `ulimit -v`) for runners with no
   * runtime-native equivalent of the JVM's `-Xmx` (i.e. C++/Python — see
   * cpp.runner.ts/python.runner.ts, which add their own startup-overhead buffer on
   * top of the question's configured limit before passing this through). POSIX only;
   * a no-op on Windows dev machines, where this is a documented, accepted gap
   * (docs/coding-engine.md §6) rather than a silently missing one.
   */
  memoryLimitMb?: number;
}

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  outputTruncated: boolean;
  runtimeMs: number;
  /** True if the process itself could not be spawned (bad path, EACCES, ...). */
  spawnError: boolean;
}

/**
 * The environment handed to a spawned *student program* (never the compiler —
 * that gets a real PATH so it can find its own internals). A fully empty
 * environment is the ideal from a leakage standpoint (docs/coding-engine.md
 * §4), but on Windows it can break process bootstrap for several runtimes
 * (Python, the JVM) that expect `SystemRoot` to resolve system DLLs. This
 * keeps only that bootstrap minimum — no PATH, no DATABASE_URL, no secrets,
 * nothing this service or the API holds ever reaches student code.
 */
export function minimalChildEnv(): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return {};
  const env: NodeJS.ProcessEnv = {};
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  if (process.env.windir) env.windir = process.env.windir;
  return env;
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    // taskkill /T kills the whole process tree — a plain child.kill() on Windows
    // only signals the immediate process, leaving anything it spawned running.
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    // The child is always spawned with `detached: true` on this platform (see below),
    // making it the leader of its own process group — so `pid` here doubles as the
    // process group id. Signalling `-pid` kills the whole group, including anything
    // the submission forked/exec'd (a bare `process.kill(pid, ...)` only signals the
    // single immediate process and lets forked grandchildren survive the kill).
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Group already gone (race with natural exit) — fall back to the single pid
      // in case the child somehow isn't a group leader (e.g. platform quirk).
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already exited
      }
    }
  }
}

/**
 * Wraps the command in `sh -c 'ulimit -v "$1"; shift; exec "$@"' sh <kb> <command> <args...>`
 * so the kernel enforces a hard RLIMIT_AS ceiling on the student process (POSIX only).
 * The script text is fixed and student-controlled values (command path, args) are passed
 * as separate argv entries, never interpolated into the script string — no shell
 * injection surface, same discipline as every other spawn in this service.
 */
function withMemoryLimit(command: string, args: string[], memoryLimitMb: number): { command: string; args: string[] } {
  const memoryLimitKb = Math.max(1, Math.floor(memoryLimitMb * 1024));
  return {
    command: '/bin/sh',
    args: ['-c', 'ulimit -v "$1"; shift; exec "$@"', 'sh', String(memoryLimitKb), command, ...args],
  };
}

export function runProcess(options: ProcessRunOptions): Promise<ProcessRunResult> {
  const { cwd, input, timeoutMs, maxOutputBytes } = options;
  const startedAt = Date.now();
  const { command, args } =
    options.memoryLimitMb && process.platform !== 'win32'
      ? withMemoryLimit(options.command, options.args, options.memoryLimitMb)
      : options;

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: options.env ?? {},
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        // New process group on POSIX so killProcessTree can signal the whole group
        // (see killProcessTree) — a forked/exec'd grandchild dies with the timeout/
        // output-cap kill instead of surviving it. No effect on Windows, which uses
        // `taskkill /T` (true tree-kill) instead.
        detached: process.platform !== 'win32',
      });
    } catch {
      resolve({
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
        timedOut: false,
        outputTruncated: false,
        runtimeMs: Date.now() - startedAt,
        spawnError: true,
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputTruncated = false;
    let timedOut = false;
    let settled = false;

    const finish = (result: Omit<ProcessRunResult, 'stdout' | 'stderr' | 'runtimeMs'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        runtimeMs: Date.now() - startedAt,
        ...result,
      });
    };

    const enforceOutputCap = () => {
      if (!outputTruncated && stdoutBytes + stderrBytes > maxOutputBytes) {
        outputTruncated = true;
        if (child.pid) killProcessTree(child.pid);
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxOutputBytes) stdoutChunks.push(chunk);
      enforceOutputCap();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxOutputBytes) stderrChunks.push(chunk);
      enforceOutputCap();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killProcessTree(child.pid);
    }, timeoutMs);

    child.on('error', () => {
      // The async counterpart to the synchronous spawn() throw caught above —
      // Node delivers ENOENT/EACCES this way for a non-shell spawn on most
      // platforms. Without this explicit flag, a missing toolchain binary was
      // silently misclassified as "the process ran and exited with no code",
      // which downstream mapped to a bogus COMPILATION_ERROR instead of the
      // retryable INTERNAL_ERROR this actually is.
      finish({ exitCode: null, signal: null, timedOut, outputTruncated, spawnError: true });
    });

    child.on('close', (code, signal) => {
      finish({ exitCode: code, signal, timedOut, outputTruncated, spawnError: false });
    });

    if (input !== undefined) {
      child.stdin?.write(input);
    }
    child.stdin?.end();
  });
}

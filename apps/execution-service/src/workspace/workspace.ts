import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * One isolated temp directory per submission execution (docs/coding-engine.md
 * §4: "each run gets a fresh directory... no submission ever touches a
 * shared filesystem location"). Reused across that submission's test cases
 * (compiling once, running many times) and always removed afterwards —
 * success, compile failure, runtime failure, timeout, or internal error all
 * go through the same `finally`.
 */
export async function withWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), `exec-${randomUUID()}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      // Best-effort cleanup — a lingering temp dir is a disk-hygiene issue, never
      // something that should surface as a failure of the submission itself.
    });
  }
}

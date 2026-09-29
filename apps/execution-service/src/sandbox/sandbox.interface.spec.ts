import { describe, expect, it } from 'vitest';
import { classifyCompileResult } from './sandbox.interface.js';

const base = { spawnError: false, timedOut: false, exitCode: 0 as number | null, stderr: '' };
const opts = { unavailableMessage: 'Compiler missing', timeoutMs: 20_000 };

describe('classifyCompileResult', () => {
  it('a clean compile succeeds', () => {
    expect(classifyCompileResult(base, '/tmp/w', opts)).toEqual({ success: true });
  });

  it('a compiler that rejected the code is a student-facing compilation error', () => {
    const r = classifyCompileResult({ ...base, exitCode: 1, stderr: 'error: expected ;' }, '/tmp/w', opts);
    expect(r.success).toBe(false);
    expect(r.internal).toBeUndefined();
    expect(r.errorMessage).toContain('expected ;');
  });

  it('a compile killed at the time limit is an infrastructure failure (retryable), not a compilation error', () => {
    // A killed process also exits non-zero with empty stderr — this used to be reported
    // to the student as "Compilation failed" for perfectly valid code.
    const r = classifyCompileResult({ ...base, timedOut: true, exitCode: 1 }, '/tmp/w', opts);
    expect(r).toMatchObject({ success: false, internal: true });
    expect(r.errorMessage).toContain('20000 ms');
  });

  it('a compiler that could not start is an infrastructure failure', () => {
    expect(classifyCompileResult({ ...base, spawnError: true, exitCode: null }, '/tmp/w', opts)).toEqual({
      success: false,
      internal: true,
      errorMessage: 'Compiler missing',
    });
  });
});

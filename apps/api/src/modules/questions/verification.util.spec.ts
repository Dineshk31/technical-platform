import { describe, expect, it } from 'vitest';
import {
  gradingChanged,
  questionVerificationStatus,
  solutionVerificationStatus,
  testCaseChanged,
  verificationApprovalIssues,
} from './verification.util.js';

describe('solutionVerificationStatus', () => {
  it('derives the state from the linked VERIFY submission verdict', () => {
    expect(solutionVerificationStatus(null)).toBe('UNVERIFIED');
    expect(solutionVerificationStatus({ status: 'PENDING' })).toBe('PENDING');
    expect(solutionVerificationStatus({ status: 'RUNNING' })).toBe('PENDING');
    expect(solutionVerificationStatus({ status: 'ACCEPTED' })).toBe('PASSED');
    for (const status of ['WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'INTERNAL_ERROR']) {
      expect(solutionVerificationStatus({ status })).toBe('FAILED');
    }
  });
});

describe('questionVerificationStatus', () => {
  it('is UNVERIFIED with no reference solutions — nothing has been proven', () => {
    expect(questionVerificationStatus([])).toBe('UNVERIFIED');
  });

  it('is PASSED only when every reference solution passed', () => {
    expect(questionVerificationStatus(['PASSED', 'PASSED'])).toBe('PASSED');
    expect(questionVerificationStatus(['PASSED', 'UNVERIFIED'])).toBe('UNVERIFIED');
    expect(questionVerificationStatus(['PASSED', 'FAILED'])).toBe('FAILED');
  });

  it('reports a still-running verification before a failure', () => {
    expect(questionVerificationStatus(['FAILED', 'PENDING'])).toBe('PENDING');
  });
});

describe('verificationApprovalIssues', () => {
  it('only a PASSED question may be approved', () => {
    expect(verificationApprovalIssues('PASSED')).toEqual([]);
    for (const s of ['UNVERIFIED', 'PENDING', 'FAILED'] as const) {
      expect(verificationApprovalIssues(s)).toHaveLength(1);
      expect(verificationApprovalIssues(s)[0].field).toBe('verification');
    }
  });
});

describe('verification reset rules', () => {
  const existing = { timeLimitSeconds: 2, memoryLimitMb: 256, referenceSolutions: { PYTHON: 'print(1)' } };

  it('a re-save of identical values keeps verification', () => {
    expect(gradingChanged(existing, { timeLimitSeconds: 2, memoryLimitMb: 256, referenceSolutions: { PYTHON: 'print(1)' } })).toBe(false);
    expect(gradingChanged(existing, {})).toBe(false);
  });

  it('changed reference code, a new reference language, or changed limits reset it', () => {
    expect(gradingChanged(existing, { referenceSolutions: { PYTHON: 'print(2)' } })).toBe(true);
    expect(gradingChanged(existing, { referenceSolutions: { PYTHON: 'print(1)', CPP: 'int main(){}' } })).toBe(true);
    expect(gradingChanged(existing, { timeLimitSeconds: 3 })).toBe(true);
    expect(gradingChanged(existing, { memoryLimitMb: 128 })).toBe(true);
  });

  it('a test-case edit resets it only when the test actually changes', () => {
    const tc = { isHidden: true, input: '1 2', expectedOutput: '3' };
    expect(testCaseChanged(tc, { isHidden: true, input: '1 2', expectedOutput: '3' })).toBe(false);
    expect(testCaseChanged(tc, { expectedOutput: '4' })).toBe(true);
    expect(testCaseChanged(tc, { input: '2 2' })).toBe(true);
    expect(testCaseChanged(tc, { isHidden: false })).toBe(true);
  });
});

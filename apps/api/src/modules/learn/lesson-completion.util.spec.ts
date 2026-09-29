import { describe, expect, it } from 'vitest';
import { isMcqAnswerCorrect } from '../scoring/scoring.util.js';
import { canSelfComplete, checkProgress, isRequiredCheck, isServedPractice, passedAllChecks } from './lesson-completion.util.js';

describe('knowledge-check grading (shared MCQ rule)', () => {
  it('single answer: only the exact correct option is right', () => {
    expect(isMcqAnswerCorrect(['a'], ['a'])).toBe(true);
    expect(isMcqAnswerCorrect(['a'], ['b'])).toBe(false);
    expect(isMcqAnswerCorrect(['a'], ['a', 'b'])).toBe(false);
  });

  it('multiple answer: all-or-nothing, order and duplicates irrelevant', () => {
    expect(isMcqAnswerCorrect(['a', 'c'], ['c', 'a'])).toBe(true);
    expect(isMcqAnswerCorrect(['a', 'c'], ['a'])).toBe(false);
    expect(isMcqAnswerCorrect(['a', 'c'], ['a', 'c', 'd'])).toBe(false);
    expect(isMcqAnswerCorrect(['a', 'c'], ['a', 'a', 'c'])).toBe(true);
  });
});

describe('lesson completion rule', () => {
  const link = (role: string, type: string, approvalStatus = 'APPROVED') => ({ role, question: { type, approvalStatus } });

  it('only approved MCQ CHECK links are required; only approved coding PRACTICE links are served', () => {
    expect(isRequiredCheck(link('CHECK', 'MCQ'))).toBe(true);
    expect(isRequiredCheck(link('CHECK', 'MCQ', 'PENDING_REVIEW'))).toBe(false);
    expect(isRequiredCheck(link('PRACTICE', 'CODING'))).toBe(false);
    expect(isServedPractice(link('PRACTICE', 'CODING'))).toBe(true);
    expect(isServedPractice(link('PRACTICE', 'CODING', 'REJECTED'))).toBe(false);
  });

  it('is passed only when every required check has a correct latest answer', () => {
    const required = ['q1', 'q2', 'q3'];
    const partial = checkProgress(required, [
      { questionId: 'q1', isCorrect: true },
      { questionId: 'q2', isCorrect: false },
    ]);
    expect(partial).toEqual({ total: 3, passed: 1 });
    expect(passedAllChecks(partial)).toBe(false);

    const all = checkProgress(required, required.map((questionId) => ({ questionId, isCorrect: true })));
    expect(passedAllChecks(all)).toBe(true);
  });

  it('ignores answers to questions that are no longer required checks', () => {
    expect(checkProgress(['q1'], [{ questionId: 'old', isCorrect: true }])).toEqual({ total: 1, passed: 0 });
  });

  it('a lesson without checks is never "passed by checks" and can be marked complete; one with checks cannot', () => {
    expect(passedAllChecks({ total: 0, passed: 0 })).toBe(false);
    expect(canSelfComplete({ total: 0, passed: 0 })).toBe(true);
    expect(canSelfComplete({ total: 2, passed: 2 })).toBe(false);
  });
});

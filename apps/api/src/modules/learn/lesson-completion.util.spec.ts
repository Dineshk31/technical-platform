import { describe, expect, it } from 'vitest';
import { isMcqAnswerCorrect } from '../scoring/scoring.util.js';
import { canSelfComplete, checkProgress, isRequiredCheck, isServedPractice, passedAllChecks, pickContinueLesson } from './lesson-completion.util.js';

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

describe('continue learning', () => {
  const lessons = [
    { id: 'a1', topic: 'Arrays', title: 'A1' },
    { id: 'a2', topic: 'Arrays', title: 'A2' },
    { id: 'h1', topic: 'Hashing', title: 'H1' },
    { id: 'h2', topic: 'Hashing', title: 'H2' },
  ];
  const t = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));

  it('suggests nothing to a student who has never touched Learn', () => {
    expect(pickContinueLesson(lessons, new Map(), [])).toBeNull();
  });

  it('resumes a lesson whose checks were answered partway, even if it was never completed', () => {
    const pick = pickContinueLesson(lessons, new Map(), [{ lessonId: 'h1', at: t(5) }]);
    expect(pick).toEqual({ lessonId: 'h1', title: 'H1', topic: 'Hashing', lastActivityAt: t(5) });
  });

  it('after a completion, moves on to the next unfinished lesson in that topic', () => {
    const pick = pickContinueLesson(lessons, new Map([['a1', t(3)]]), [{ lessonId: 'a1', at: t(2) }]);
    expect(pick).toMatchObject({ lessonId: 'a2', lastActivityAt: t(3) });
  });

  it('follows the most recent activity across topics, and skips a finished topic', () => {
    const completed = new Map([
      ['a1', t(1)],
      ['a2', t(9)],
    ]);
    // Arrays is finished (most recent), so the older, unfinished Hashing check wins.
    expect(pickContinueLesson(lessons, completed, [{ lessonId: 'h2', at: t(4) }])).toMatchObject({ lessonId: 'h2', topic: 'Hashing' });
  });

  it('ignores activity on lessons that are no longer published', () => {
    expect(pickContinueLesson(lessons, new Map(), [{ lessonId: 'gone', at: t(1) }])).toBeNull();
  });
});

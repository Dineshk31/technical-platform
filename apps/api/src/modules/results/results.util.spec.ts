import { describe, expect, it } from 'vitest';
import { aggregateQuestionOutcomes, type SubmissionOutcomeRow } from './results.util.js';

const t = (secondsFromNow: number) => new Date(Date.now() + secondsFromNow * 1000);

function row(questionId: string, kind: 'RUN' | 'SUBMIT', status: string, createdAt: Date): SubmissionOutcomeRow {
  return { questionId, kind, status, createdAt };
}

describe('aggregateQuestionOutcomes', () => {
  it('a question with no rows at all is absent from the map (NOT_ATTEMPTED, per assessment-system.md §4)', () => {
    const outcomes = aggregateQuestionOutcomes([]);
    expect(outcomes.get('q1')).toBeUndefined();
  });

  it('a single ACCEPTED submit -> solved', () => {
    const outcomes = aggregateQuestionOutcomes([row('q1', 'SUBMIT', 'ACCEPTED', t(0))]);
    expect(outcomes.get('q1')).toMatchObject({ solved: true, attempted: true, latestSubmitVerdict: 'ACCEPTED', submissionCount: 1 });
  });

  it('a single WRONG_ANSWER submit -> attempted, not solved', () => {
    const outcomes = aggregateQuestionOutcomes([row('q1', 'SUBMIT', 'WRONG_ANSWER', t(0))]);
    expect(outcomes.get('q1')).toMatchObject({ solved: false, attempted: true, latestSubmitVerdict: 'WRONG_ANSWER', submissionCount: 1 });
  });

  it('wrong then accepted -> solved (best-of, not "latest wins")', () => {
    const outcomes = aggregateQuestionOutcomes([
      row('q1', 'SUBMIT', 'WRONG_ANSWER', t(0)),
      row('q1', 'SUBMIT', 'ACCEPTED', t(10)),
    ]);
    expect(outcomes.get('q1')?.solved).toBe(true);
    expect(outcomes.get('q1')?.latestSubmitVerdict).toBe('ACCEPTED');
  });

  it('accepted then a later wrong submission -> still solved (never penalized for retrying)', () => {
    const outcomes = aggregateQuestionOutcomes([
      row('q1', 'SUBMIT', 'ACCEPTED', t(0)),
      row('q1', 'SUBMIT', 'WRONG_ANSWER', t(10)),
    ]);
    expect(outcomes.get('q1')?.solved).toBe(true);
    // display verdict still reflects the most recent attempt, independent of scoring
    expect(outcomes.get('q1')?.latestSubmitVerdict).toBe('WRONG_ANSWER');
  });

  it('only RUN submissions (never Submitted) -> attempted, not solved, no verdict', () => {
    const outcomes = aggregateQuestionOutcomes([row('q1', 'RUN', 'ACCEPTED', t(0))]);
    expect(outcomes.get('q1')).toMatchObject({ solved: false, attempted: true, latestSubmitVerdict: null, submissionCount: 0 });
  });

  it('counts only SUBMIT rows toward submissionCount, ignoring RUN rows', () => {
    const outcomes = aggregateQuestionOutcomes([
      row('q1', 'RUN', 'ACCEPTED', t(0)),
      row('q1', 'RUN', 'WRONG_ANSWER', t(1)),
      row('q1', 'SUBMIT', 'COMPILATION_ERROR', t(2)),
      row('q1', 'SUBMIT', 'ACCEPTED', t(3)),
    ]);
    expect(outcomes.get('q1')?.submissionCount).toBe(2);
    expect(outcomes.get('q1')?.solved).toBe(true);
  });

  it('every non-ACCEPTED verdict (compilation/runtime/timeout/wrong) earns no marks (solved=false)', () => {
    for (const status of ['COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'WRONG_ANSWER', 'INTERNAL_ERROR']) {
      const outcomes = aggregateQuestionOutcomes([row('q1', 'SUBMIT', status, t(0))]);
      expect(outcomes.get('q1')?.solved).toBe(false);
      expect(outcomes.get('q1')?.latestSubmitVerdict).toBe(status);
    }
  });

  it('aggregates multiple independent questions in one pass without cross-contamination', () => {
    const outcomes = aggregateQuestionOutcomes([
      row('q1', 'SUBMIT', 'ACCEPTED', t(0)),
      row('q2', 'SUBMIT', 'WRONG_ANSWER', t(0)),
      row('q3', 'RUN', 'ACCEPTED', t(0)),
    ]);
    expect(outcomes.size).toBe(3);
    expect(outcomes.get('q1')?.solved).toBe(true);
    expect(outcomes.get('q2')?.solved).toBe(false);
    expect(outcomes.get('q2')?.attempted).toBe(true);
    expect(outcomes.get('q3')?.attempted).toBe(true);
    expect(outcomes.get('q3')?.solved).toBe(false);
  });
});

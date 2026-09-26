import { describe, expect, it } from 'vitest';
import { computeTopicBreakdown, type TopicQuestionInput } from './results.util.js';

const q = (topics: string[], maxMarks: number, marksObtained: number, status: TopicQuestionInput['status']): TopicQuestionInput => ({
  topics,
  maxMarks,
  marksObtained,
  status,
});

describe('computeTopicBreakdown', () => {
  it('returns nothing for questions without topics', () => {
    expect(computeTopicBreakdown([q([], 10, 0, 'NOT_ATTEMPTED')])).toEqual([]);
  });

  it('sums marks and counts per topic', () => {
    const [arrays] = computeTopicBreakdown([q(['Arrays'], 10, 10, 'SOLVED'), q(['Arrays'], 20, 0, 'ATTEMPTED')]);
    expect(arrays).toMatchObject({ topic: 'Arrays', maxMarks: 30, marksObtained: 10, totalQuestions: 2, solvedQuestions: 1, percentage: 33.33, needsWork: true });
  });

  it('counts a multi-topic question toward every topic it is tagged with, once each', () => {
    const result = computeTopicBreakdown([q(['Arrays', 'Two Pointers', 'Arrays'], 10, 10, 'SOLVED')]);
    expect(result.map((t) => [t.topic, t.totalQuestions])).toEqual([
      ['Arrays', 1],
      ['Two Pointers', 1],
    ]);
  });

  it('flags a topic below half its marks, not at exactly half', () => {
    const result = computeTopicBreakdown([q(['Strings'], 10, 5, 'ATTEMPTED'), q(['Graphs'], 10, 4.99, 'ATTEMPTED')]);
    expect(result.find((t) => t.topic === 'Strings')?.needsWork).toBe(false);
    expect(result.find((t) => t.topic === 'Graphs')?.needsWork).toBe(true);
  });

  it('never flags a zero-mark topic', () => {
    expect(computeTopicBreakdown([q(['Sorting'], 0, 0, 'NOT_ATTEMPTED')])[0]).toMatchObject({ percentage: 0, needsWork: false });
  });

  it('orders needs-work topics first, weakest first', () => {
    const result = computeTopicBreakdown([
      q(['Hashing'], 10, 10, 'SOLVED'),
      q(['Graphs'], 10, 4, 'ATTEMPTED'),
      q(['Dynamic Programming'], 10, 0, 'NOT_ATTEMPTED'),
      q(['Strings'], 10, 6, 'ATTEMPTED'),
    ]);
    expect(result.map((t) => t.topic)).toEqual(['Dynamic Programming', 'Graphs', 'Strings', 'Hashing']);
  });
});

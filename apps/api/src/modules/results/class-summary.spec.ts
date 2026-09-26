import { describe, expect, it } from 'vitest';
import { aggregateClassResults, computeTopicBreakdown, type ClassAttemptInput, type ClassQuestionInput } from './results.util.js';

const Q1 = { questionId: 'q1', title: 'Two Sum', difficulty: 'EASY', topics: ['Arrays', 'Hashing'], maxMarks: 10 };
const Q2 = { questionId: 'q2', title: 'LIS', difficulty: 'HARD', topics: ['Dynamic Programming'], maxMarks: 20 };

function attempt(q1: [number, ClassQuestionInput['status']], q2: [number, ClassQuestionInput['status']]): ClassAttemptInput {
  const questions: ClassQuestionInput[] = [
    { ...Q1, marksObtained: q1[0], status: q1[1] },
    { ...Q2, marksObtained: q2[0], status: q2[1] },
  ];
  const total = q1[0] + q2[0];
  return { percentage: Math.round((total / 30) * 10000) / 100, questions, topics: computeTopicBreakdown(questions) };
}

describe('aggregateClassResults', () => {
  it('returns an honest empty summary when nobody has finished', () => {
    const s = aggregateClassResults([Q1, Q2], []);
    expect(s).toMatchObject({ completed: 0, averagePercentage: null, highestPercentage: null, lowestPercentage: null, topics: [] });
    expect(s.questions.map((q) => [q.questionId, q.attempted, q.solved, q.solveRate])).toEqual([
      ['q1', 0, 0, 0],
      ['q2', 0, 0, 0],
    ]);
  });

  it('aggregates per-question solve counts and average marks in assessment order', () => {
    const s = aggregateClassResults([Q1, Q2], [
      attempt([10, 'SOLVED'], [0, 'ATTEMPTED']),
      attempt([10, 'SOLVED'], [0, 'NOT_ATTEMPTED']),
      attempt([0, 'ATTEMPTED'], [20, 'SOLVED']),
    ]);
    expect(s.completed).toBe(3);
    expect(s.questions[0]).toMatchObject({ questionId: 'q1', attempted: 3, solved: 2, averageMarks: 6.67, solveRate: 66.67 });
    expect(s.questions[1]).toMatchObject({ questionId: 'q2', attempted: 2, solved: 1, averageMarks: 6.67, solveRate: 33.33 });
  });

  it('reports overall average / highest / lowest percentage', () => {
    const s = aggregateClassResults([Q1, Q2], [attempt([10, 'SOLVED'], [20, 'SOLVED']), attempt([0, 'ATTEMPTED'], [0, 'ATTEMPTED'])]);
    expect(s).toMatchObject({ averagePercentage: 50, highestPercentage: 100, lowestPercentage: 0 });
  });

  it('orders topics weakest-first and counts students flagged needs-work with the student-page rule', () => {
    const s = aggregateClassResults([Q1, Q2], [
      attempt([10, 'SOLVED'], [0, 'ATTEMPTED']),
      attempt([10, 'SOLVED'], [0, 'NOT_ATTEMPTED']),
      attempt([0, 'ATTEMPTED'], [20, 'SOLVED']),
    ]);
    expect(s.topics[0]).toEqual({ topic: 'Dynamic Programming', averagePercentage: 33.33, studentsNeedingWork: 2, students: 3 });
    expect(s.topics.slice(1).map((t) => [t.topic, t.averagePercentage, t.studentsNeedingWork])).toEqual([
      ['Arrays', 66.67, 1],
      ['Hashing', 66.67, 1],
    ]);
  });
});

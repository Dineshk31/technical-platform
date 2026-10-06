import { describe, expect, it } from 'vitest';
import { groupByPracticeTier, lessonQualityIssues, type LessonQualityInput } from './lesson-quality.js';

const good: LessonQualityInput = {
  topic: 'Binary Search',
  objectives: ['Implement iterative binary search', 'Identify boundary-condition errors', 'Analyse its time complexity'],
  concept: 'Halve the range each step, so it takes O(log n) steps.\n\n```python\nlo, hi = 0, n - 1\n```\n\n```text\nlo=0 hi=7\n```',
  example: null,
  commonMistakes: null,
  checkCount: 2,
  practiceCount: 2,
};

const messages = (input: Partial<LessonQualityInput>) => lessonQualityIssues({ ...good, ...input }).map((i) => `${i.level}: ${i.message}`);

describe('lessonQualityIssues', () => {
  it('has nothing to say about a well-formed lesson', () => {
    expect(lessonQualityIssues(good)).toEqual([]);
  });

  it('warns about missing objectives and flags vague ones by name', () => {
    expect(messages({ objectives: [] })[0]).toMatch(/^warning: No learning objectives/);
    const vague = messages({ objectives: ['Understand binary search completely', 'Implement it'] });
    expect(vague).toEqual([expect.stringMatching(/^warning: Objective "Understand binary search completely" is vague/)]);
  });

  it('notes an unusual objective count without treating it as an error', () => {
    expect(messages({ objectives: ['Implement it'] })).toEqual([expect.stringMatching(/^info: 1 objectives/)]);
  });

  it('warns about an unlabelled code fence but accepts ```text traces', () => {
    expect(messages({ concept: 'O(n).\n\n```\nx = 1\n```\n\n```python\ny = 2\n```' })).toEqual([expect.stringMatching(/no language label/)]);
  });

  it('expects code and a complexity note only for algorithm topics', () => {
    const noCode = messages({ concept: 'Prose only, and it runs in O(n).' });
    expect(noCode).toEqual([expect.stringMatching(/^warning: No code example/)]);
    expect(messages({ concept: '```python\nx = 1\n```' })).toEqual([expect.stringMatching(/^info: No complexity note/)]);
    // A fundamentals lesson is legitimately prose-only.
    expect(messages({ topic: 'DBMS', concept: 'Normal forms reduce redundancy.' })).toEqual([]);
  });

  it('treats missing checks and practice as information, never as blocking', () => {
    const issues = lessonQualityIssues({ ...good, checkCount: 0, practiceCount: 0 });
    expect(issues.map((i) => i.level)).toEqual(['info', 'info']);
  });
});

describe('groupByPracticeTier', () => {
  it('groups by difficulty, easiest first, keeping author order and dropping empty tiers', () => {
    const groups = groupByPracticeTier([
      { id: 'm1', difficulty: 'MEDIUM' },
      { id: 'e1', difficulty: 'EASY' },
      { id: 'm2', difficulty: 'MEDIUM' },
    ]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Apply the concept', ['e1']],
      ['Build confidence', ['m1', 'm2']],
    ]);
  });
});

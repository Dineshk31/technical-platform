import { describe, expect, it } from 'vitest';
import { resolveWeakAreas, type TopicProgress } from './weak-areas';

const t = (topic: string, total: number, solved: number, attempted: number): TopicProgress => ({ topic, total, solved, attempted });

describe('resolveWeakAreas', () => {
  it('ignores topics the student has never touched', () => {
    expect(resolveWeakAreas([t('Graphs', 5, 0, 0)])).toEqual([]);
  });

  it('ignores topics with fewer than 2 problems', () => {
    expect(resolveWeakAreas([t('Trees', 1, 0, 1)])).toEqual([]);
  });

  it('ignores topics with at least one solve', () => {
    expect(resolveWeakAreas([t('Arrays', 4, 1, 2)])).toEqual([]);
  });

  it('flags attempted-but-unsolved topics, most-struggled first, then by size', () => {
    const result = resolveWeakAreas([
      t('Strings', 3, 0, 1),
      t('Sorting', 6, 0, 1),
      t('Dynamic Programming', 2, 0, 2),
      t('Graphs', 8, 0, 0),
    ]);
    expect(result.map((a) => a.topic)).toEqual(['Dynamic Programming', 'Sorting', 'Strings']);
  });

  it('respects the limit', () => {
    const many = ['A', 'B', 'C', 'D'].map((n) => t(n, 2, 0, 1));
    expect(resolveWeakAreas(many)).toHaveLength(3);
    expect(resolveWeakAreas(many, 1)).toHaveLength(1);
  });
});

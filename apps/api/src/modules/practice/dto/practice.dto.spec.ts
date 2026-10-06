import { describe, expect, it } from 'vitest';
import { pickRelatedLessons, type RelatedLessonCandidate } from './practice.dto.js';

const lesson = (id: string, topic: string, orderIndex: number, attachesProblem = false): RelatedLessonCandidate => ({
  id,
  topic,
  title: id,
  summary: `${id} summary`,
  orderIndex,
  attachesProblem,
});

describe('pickRelatedLessons', () => {
  it('puts the lesson that attaches the problem first, then introduces each uncovered topic', () => {
    const picked = pickRelatedLessons(
      ['Binary Search', 'Arrays'],
      [lesson('arrays-1', 'Arrays', 0), lesson('arrays-2', 'Arrays', 1), lesson('bs-1', 'Binary Search', 0), lesson('bs-2', 'Binary Search', 1, true)],
    );
    expect(picked.map((l) => [l.id, l.reason])).toEqual([
      ['bs-2', 'ATTACHED'],
      ['arrays-1', 'TOPIC'],
    ]);
  });

  it("falls back to each topic's first lesson when no lesson attaches the problem", () => {
    const picked = pickRelatedLessons(['Hashing'], [lesson('h-2', 'Hashing', 1), lesson('h-1', 'Hashing', 0)]);
    expect(picked.map((l) => l.id)).toEqual(['h-1']);
  });

  it('returns nothing when no published lesson exists for the problem or its topics', () => {
    expect(pickRelatedLessons(['Graphs'], [])).toEqual([]);
  });

  it('caps the list', () => {
    const many = ['a', 'b', 'c', 'd'].map((id, i) => lesson(id, 'Arrays', i, true));
    expect(pickRelatedLessons(['Arrays'], many, 3)).toHaveLength(3);
  });
});

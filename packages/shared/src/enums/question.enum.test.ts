import { describe, expect, it } from 'vitest';
import { CODING_TOPICS, MCQ_TOPICS, TOPIC_AREAS, TOPICS, isTopic } from './question.enum.js';
import { CreateLessonSchema } from '../schemas/learn.schema.js';
import { CodingQuestionFieldsSchema, McqQuestionFieldsSchema } from '../schemas/question.schema.js';

describe('topic catalog', () => {
  it('is the duplicate-free union of the coding and MCQ lists, so existing data stays valid', () => {
    expect(new Set(TOPICS).size).toBe(TOPICS.length);
    for (const t of [...CODING_TOPICS, ...MCQ_TOPICS]) expect(isTopic(t)).toBe(true);
    expect(isTopic('Not A Topic')).toBe(false);
  });

  it('TOPIC_AREAS partitions the catalog exactly (every topic in exactly one area)', () => {
    const grouped = TOPIC_AREAS.flatMap((a) => a.topics);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...TOPICS].sort());
  });
});

describe('topic validation per content type', () => {
  const mcq = {
    title: 'Array index',
    mcqType: 'SINGLE_CHOICE',
    questionText: 'What is the index of the first element?',
    difficulty: 'EASY',
    marks: 1,
    options: [
      { optionText: '0', isCorrect: true },
      { optionText: '1', isCorrect: false },
    ],
  };

  it('lets an MCQ (knowledge check) use a DSA topic as well as a fundamentals topic', () => {
    expect(McqQuestionFieldsSchema.safeParse({ ...mcq, topics: ['Arrays'] }).success).toBe(true);
    expect(McqQuestionFieldsSchema.safeParse({ ...mcq, topics: ['DBMS'] }).success).toBe(true);
    expect(McqQuestionFieldsSchema.safeParse({ ...mcq, topics: ['Nonsense'] }).success).toBe(false);
  });

  it('lets a lesson use any catalog topic but nothing outside it', () => {
    const lesson = { title: 'T', summary: 'S', concept: 'C' };
    expect(CreateLessonSchema.safeParse({ ...lesson, topic: 'Arrays' }).success).toBe(true);
    expect(CreateLessonSchema.safeParse({ ...lesson, topic: 'Operating Systems' }).success).toBe(true);
    expect(CreateLessonSchema.safeParse({ ...lesson, topic: 'Cooking' }).success).toBe(false);
  });

  it('keeps coding problems on DSA topics only', () => {
    const topicsField = CodingQuestionFieldsSchema.shape.topics;
    expect(topicsField.safeParse(['Arrays']).success).toBe(true);
    expect(topicsField.safeParse(['DBMS']).success).toBe(false);
  });
});

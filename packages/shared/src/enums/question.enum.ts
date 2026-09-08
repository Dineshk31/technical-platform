export const DIFFICULTY_LEVELS = ['EASY', 'MEDIUM', 'HARD'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

// Initial set per docs/coding-engine.md — C and JavaScript are future additions.
export const PROGRAMMING_LANGUAGES = ['CPP', 'JAVA', 'PYTHON'] as const;
export type ProgrammingLanguageCode = (typeof PROGRAMMING_LANGUAGES)[number];

export const APPROVAL_STATUS_CODES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_EDIT'] as const;
export type ApprovalStatusCode = (typeof APPROVAL_STATUS_CODES)[number];

export const QUESTION_SOURCE_CODES = ['MANUAL', 'AI_GENERATED'] as const;
export type QuestionSourceCode = (typeof QUESTION_SOURCE_CODES)[number];

export const QUESTION_TYPE_CODES = ['CODING', 'MCQ'] as const;
export type QuestionTypeCode = (typeof QUESTION_TYPE_CODES)[number];

// mcq_type enum (schema.prisma) — SINGLE_CHOICE/CODE_OUTPUT/SCENARIO are all single-answer
// (exactly one correct option); MULTIPLE_CHOICE is the only multi-answer variant, per
// docs/question-system.md §5 ("MVP is all-or-nothing... same reserved-but-not-built pattern").
export const MCQ_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'CODE_OUTPUT', 'SCENARIO'] as const;
export type McqTypeCode = (typeof MCQ_TYPES)[number];

// Fixed topic list per docs/question-system.md §3 — kept here so the admin UI's
// dropdowns and the API's validation always agree on what a "topic" is.
export const CODING_TOPICS = [
  'Arrays',
  'Strings',
  'Hashing',
  'Sorting',
  'Searching',
  'Binary Search',
  'Two Pointers',
  'Sliding Window',
  'Recursion',
  'Backtracking',
  'Linked Lists',
  'Stacks',
  'Queues',
  'Trees',
  'Binary Search Trees',
  'Heaps',
  'Graphs',
  'Greedy Algorithms',
  'Dynamic Programming',
  'Bit Manipulation',
] as const;
export type CodingTopic = (typeof CODING_TOPICS)[number];

// Fixed topic list for technical MCQs per docs/question-system.md §5 — separate from
// CODING_TOPICS since MCQs cover CS fundamentals broadly, not just DSA.
export const MCQ_TOPICS = [
  'DSA',
  'Programming',
  'OOP',
  'DBMS',
  'Operating Systems',
  'Computer Networks',
  'Computer Architecture',
  'Software Engineering',
] as const;
export type McqTopic = (typeof MCQ_TOPICS)[number];

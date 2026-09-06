export const DIFFICULTY_LEVELS = ['EASY', 'MEDIUM', 'HARD'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

// Initial set per docs/coding-engine.md — C and JavaScript are future additions.
export const PROGRAMMING_LANGUAGES = ['CPP', 'JAVA', 'PYTHON'] as const;
export type ProgrammingLanguageCode = (typeof PROGRAMMING_LANGUAGES)[number];

export const APPROVAL_STATUS_CODES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_EDIT'] as const;
export type ApprovalStatusCode = (typeof APPROVAL_STATUS_CODES)[number];

export const QUESTION_SOURCE_CODES = ['MANUAL', 'AI_GENERATED'] as const;
export type QuestionSourceCode = (typeof QUESTION_SOURCE_CODES)[number];

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

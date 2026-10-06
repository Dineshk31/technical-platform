import { CODING_TOPICS } from '../enums/question.enum.js';

/**
 * Editorial feedback for a lesson — shared by the admin lesson editor and the
 * `content:check` script so both apply exactly the same rules. These are advice,
 * never a publishing gate: a legitimate lesson (say, a short conceptual one with no
 * code) must stay publishable. The hard gates — approved checks, verified practice —
 * live on the server (LessonsService) and are unchanged.
 */
export interface LessonQualityInput {
  topic: string;
  objectives: string[];
  concept: string;
  example?: string | null;
  commonMistakes?: string | null;
  checkCount: number;
  practiceCount: number;
}

export interface LessonQualityIssue {
  /** `warning` = probably a real problem for students; `info` = worth a look. */
  level: 'warning' | 'info';
  message: string;
}

// An objective should name something the student will be able to *do*.
const VAGUE_OBJECTIVE = /^(understand|know|learn|be (familiar|aware)|appreciate|get to know)\b|\b(completely|fully understand|everything about)\b/i;
const COMPLEXITY = /O\(|complexity|\bn!|2\^n|2ⁿ|\blinear time\b|\blog n\b/i;
const LONG_LESSON_WORDS = 1800;

export function lessonQualityIssues(lesson: LessonQualityInput): LessonQualityIssue[] {
  const issues: LessonQualityIssue[] = [];
  const objectives = lesson.objectives.map((o) => o.trim()).filter(Boolean);
  const body = [lesson.concept, lesson.example ?? '', lesson.commonMistakes ?? ''].join('\n\n');
  const isAlgorithmTopic = (CODING_TOPICS as readonly string[]).includes(lesson.topic);

  if (objectives.length === 0) {
    issues.push({ level: 'warning', message: 'No learning objectives — add 2–5 things the student will be able to do.' });
  } else if (objectives.length === 1 || objectives.length > 5) {
    issues.push({ level: 'info', message: `${objectives.length} objectives — 2 to 5 usually reads best.` });
  }
  for (const o of objectives) {
    if (VAGUE_OBJECTIVE.test(o)) {
      issues.push({ level: 'warning', message: `Objective "${o}" is vague — name an action (implement, trace, explain why, choose).` });
    }
  }

  const fences = [...body.matchAll(/^```([^\n`]*)$/gm)].map((m) => m[1].trim());
  // Fences come in open/close pairs; only an opening fence can carry a language.
  const openings = fences.filter((_, i) => i % 2 === 0);
  if (openings.some((lang) => lang === '')) {
    issues.push({ level: 'warning', message: 'A code block has no language label — start it with ```python, ```cpp or ```java (```text for traces).' });
  }
  const hasCode = openings.some((lang) => lang !== '' && lang !== 'text');
  if (isAlgorithmTopic && !hasCode) {
    issues.push({ level: 'warning', message: 'No code example — an algorithm lesson should show at least one implementation.' });
  }
  if (isAlgorithmTopic && !COMPLEXITY.test(body)) {
    issues.push({ level: 'info', message: 'No complexity note — say what the technique costs in time and space, with a concrete example.' });
  }

  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > LONG_LESSON_WORDS) {
    issues.push({ level: 'info', message: `About ${words} words — consider splitting it; most lessons here are under 600.` });
  }

  if (lesson.practiceCount === 0) {
    issues.push({ level: 'info', message: 'No practice problems attached — the lesson will point students to the topic instead.' });
  }
  if (lesson.checkCount === 0) {
    issues.push({ level: 'info', message: 'No knowledge checks — students will complete it with "Mark complete".' });
  }
  return issues;
}

/**
 * How a lesson's practice problems are grouped for students. Derived from the
 * problem's own difficulty rather than stored per link, so it can never drift from
 * the problem it describes and needs no schema change.
 */
export const PRACTICE_TIERS = [
  { tier: 'APPLY', label: 'Apply the concept', difficulty: 'EASY' },
  { tier: 'BUILD', label: 'Build confidence', difficulty: 'MEDIUM' },
  { tier: 'CHALLENGE', label: 'Challenge yourself', difficulty: 'HARD' },
] as const;
export type PracticeTier = (typeof PRACTICE_TIERS)[number]['tier'];

/** Groups items by tier (easiest first), keeping the author's order inside each group
 * and dropping empty groups. */
export function groupByPracticeTier<T extends { difficulty: string }>(items: T[]) {
  return PRACTICE_TIERS.map((t) => ({ tier: t.tier, label: t.label, items: items.filter((i) => i.difficulty === t.difficulty) })).filter(
    (g) => g.items.length > 0,
  );
}

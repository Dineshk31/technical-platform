import type {
  CodingQuestion,
  CodingQuestionLanguage,
  CodingStarterTemplate,
  CodingTestCase,
  PracticeCodeDraft,
  Question,
} from '../../../../generated/prisma/index.js';
import { toNum } from '../../questions/dto/question.dto.js';

export type PracticeQuestionStatus = 'SOLVED' | 'ATTEMPTED' | 'NOT_ATTEMPTED';

/** Same "everything real, nothing invented" status rule as
 * AssessmentsService.computeQuestionStatuses, minus the MCQ branch — practice is
 * CODING-only (see PracticeQuestionQuerySchema's comment in packages/shared). */
export function computePracticeStatus(submissions: { kind: string; status: string }[]): PracticeQuestionStatus {
  if (submissions.some((s) => s.kind === 'SUBMIT' && s.status === 'ACCEPTED')) return 'SOLVED';
  if (submissions.length > 0) return 'ATTEMPTED';
  return 'NOT_ATTEMPTED';
}

export type PracticeQuestionListSource = Question & {
  codingQuestion: { languages: CodingQuestionLanguage[] } | null;
};

/**
 * Problem Explorer row — deliberately narrow (no problem statement/test cases/
 * starter code, those only load on the detail page): title, difficulty, topics,
 * supported languages, and this student's own status. No hidden test case or
 * reference solution content exists anywhere in the CodingQuestion query this is
 * built from, so there is nothing here that could leak them (docs/security.md §2).
 */
export function toPracticeQuestionListItem(q: PracticeQuestionListSource, status: PracticeQuestionStatus) {
  return {
    id: q.id,
    title: q.title,
    difficulty: q.difficulty,
    topics: q.topics,
    marks: toNum(q.marks),
    supportedLanguages: (q.codingQuestion?.languages ?? []).map((l) => l.language),
    status,
  };
}

export type PracticeQuestionDetailSource = Question & {
  codingQuestion:
    | (CodingQuestion & {
        languages: CodingQuestionLanguage[];
        testCases: CodingTestCase[];
        starterTemplates: CodingStarterTemplate[];
      })
    | null;
};

/**
 * The practice workspace's question payload — same restricted shape as
 * AssessmentsService.getStudentQuestions' CODING branch (public test cases only,
 * no reference solutions), plus this student's saved drafts (Practice Mode has no
 * attempt to scope drafts to, so they're returned inline with the question instead
 * of via a separate bulk-fetch endpoint like AttemptsController.getDrafts).
 */
export function toPracticeQuestionDetail(
  q: PracticeQuestionDetailSource,
  status: PracticeQuestionStatus,
  drafts: Pick<PracticeCodeDraft, 'language' | 'code' | 'updatedAt'>[],
) {
  const cq = q.codingQuestion;
  return {
    id: q.id,
    title: q.title,
    difficulty: q.difficulty,
    topics: q.topics,
    marks: toNum(q.marks),
    status,
    problemStatement: cq?.problemStatement ?? '',
    inputFormat: cq?.inputFormat ?? '',
    outputFormat: cq?.outputFormat ?? '',
    constraints: cq?.constraints ?? [],
    examples: (cq?.examples as unknown) ?? [],
    timeLimitSeconds: toNum(cq?.timeLimitSeconds),
    memoryLimitMb: cq?.memoryLimitMb ?? 0,
    supportedLanguages: (cq?.languages ?? []).map((l) => l.language),
    publicTestCases: (cq?.testCases ?? []).map((tc) => ({ id: tc.id, input: tc.input, expectedOutput: tc.expectedOutput })),
    starterCode: Object.fromEntries((cq?.starterTemplates ?? []).map((st) => [st.language, st.code])),
    drafts: drafts.map((d) => ({ language: d.language, code: d.code, updatedAt: d.updatedAt })),
  };
}

export type RelatedLessonCandidate = {
  id: string;
  topic: string;
  title: string;
  summary: string;
  orderIndex: number;
  /** true when the lesson's author attached this exact problem as practice. */
  attachesProblem: boolean;
};

/**
 * The lessons a student can open from a coding problem ("stuck? read the concept"). Lessons
 * whose author attached this very problem come first — they were written for it — then,
 * for each of the problem's topics not already covered, that topic's first lesson as an
 * introduction. Published lessons only (the caller filters), at most `max`, and never a
 * prerequisite: the workspace just offers them.
 */
export function pickRelatedLessons(problemTopics: string[], candidates: RelatedLessonCandidate[], max = 3) {
  const topicRank = (topic: string) => {
    const i = problemTopics.indexOf(topic);
    return i === -1 ? problemTopics.length : i;
  };
  const ordered = [...candidates].sort((a, b) => topicRank(a.topic) - topicRank(b.topic) || a.orderIndex - b.orderIndex);
  const attached = ordered.filter((l) => l.attachesProblem);
  const coveredTopics = new Set(attached.map((l) => l.topic));
  const introductions = problemTopics
    .filter((topic) => !coveredTopics.has(topic))
    .map((topic) => ordered.find((l) => l.topic === topic))
    .filter((l): l is RelatedLessonCandidate => l !== undefined);
  return [...attached, ...introductions].slice(0, max).map((l) => ({
    id: l.id,
    topic: l.topic,
    title: l.title,
    summary: l.summary,
    reason: l.attachesProblem ? ('ATTACHED' as const) : ('TOPIC' as const),
  }));
}

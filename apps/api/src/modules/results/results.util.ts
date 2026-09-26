import { isGradedAcceptance } from '../scoring/scoring.util.js';

export interface SubmissionOutcomeRow {
  questionId: string;
  kind: string;
  status: string;
  createdAt: Date;
}

export interface QuestionOutcome {
  /** A SUBMIT with status ACCEPTED exists for this question — full marks, no matter
   * how many attempts came before or after it (docs/assessment-system.md §5: "the
   * best SUBMIT submission's score, not the last one — a student shouldn't be
   * penalized for trying again with a worse attempt still counting"). */
  solved: boolean;
  /** At least one RUN or SUBMIT exists for this question (assessment-system.md §4). */
  attempted: boolean;
  /** The most recent SUBMIT's status, for display when not solved (e.g. "your last
   * submission was WRONG_ANSWER") — null if the student never clicked Submit
   * (only ever Run, or never touched the question at all). Irrelevant to scoring:
   * scoring only ever asks "was any SUBMIT ever ACCEPTED", never "what was latest". */
  latestSubmitVerdict: string | null;
  /** Count of SUBMIT-kind submissions for this question (Part 5: "number of final
   * submissions if useful"). */
  submissionCount: number;
}

/**
 * The single place "what happened on this question" is computed from raw
 * submission rows — used by both attempt finalization (ResultsService,
 * persisted scalars) and the on-demand per-question/section breakdown
 * (ResultsService, display-only). Takes one attempt's full submission list
 * (a single query — see ResultsService) rather than querying per question, so
 * building a result for an N-question assessment costs one query, not N.
 */
export function aggregateQuestionOutcomes(submissions: SubmissionOutcomeRow[]): Map<string, QuestionOutcome> {
  const byQuestion = new Map<string, SubmissionOutcomeRow[]>();
  for (const row of submissions) {
    const bucket = byQuestion.get(row.questionId);
    if (bucket) bucket.push(row);
    else byQuestion.set(row.questionId, [row]);
  }

  const outcomes = new Map<string, QuestionOutcome>();
  for (const [questionId, rows] of byQuestion) {
    // Rows are already in createdAt-ascending order (caller queries ORDER BY
    // createdAt ASC) — the last SUBMIT in this filtered list is the latest one.
    const submits = rows.filter((r) => r.kind === 'SUBMIT');
    const solved = submits.some((r) => isGradedAcceptance(r.kind, r.status));
    outcomes.set(questionId, {
      solved,
      attempted: rows.length > 0,
      latestSubmitVerdict: submits.length > 0 ? submits[submits.length - 1].status : null,
      submissionCount: submits.length,
    });
  }
  return outcomes;
}

export interface TopicQuestionInput {
  topics: string[];
  maxMarks: number;
  marksObtained: number;
  status: 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';
}

export interface TopicResultDetail {
  topic: string;
  maxMarks: number;
  marksObtained: number;
  percentage: number;
  totalQuestions: number;
  solvedQuestions: number;
  needsWork: boolean;
}

/** Below this share of a topic's available marks, the topic is flagged "needs work". */
export const TOPIC_NEEDS_WORK_THRESHOLD = 0.5;

/**
 * Per-topic view of one attempt, derived at read time from the same per-question
 * rows the section breakdown already produces — nothing new is stored, so it can
 * never disagree with the score. A question tagged with several topics counts
 * toward each of them (it genuinely tests all of them). Questions with no topics
 * are skipped rather than lumped into a fake "Other" bucket.
 *
 * The rule is deliberately simple and shown to the student verbatim: a topic
 * "needs work" when they earned less than half of its available marks. Topics
 * worth 0 marks are never flagged. Ordered weakest-first so the page leads with
 * what to do next.
 */
export function computeTopicBreakdown(questions: TopicQuestionInput[]): TopicResultDetail[] {
  const byTopic = new Map<string, { maxMarks: number; marksObtained: number; totalQuestions: number; solvedQuestions: number }>();
  for (const q of questions) {
    for (const topic of new Set(q.topics)) {
      const entry = byTopic.get(topic) ?? { maxMarks: 0, marksObtained: 0, totalQuestions: 0, solvedQuestions: 0 };
      entry.maxMarks += q.maxMarks;
      entry.marksObtained += q.marksObtained;
      entry.totalQuestions += 1;
      if (q.status === 'SOLVED') entry.solvedQuestions += 1;
      byTopic.set(topic, entry);
    }
  }

  return [...byTopic.entries()]
    .map(([topic, e]) => {
      const ratio = e.maxMarks > 0 ? e.marksObtained / e.maxMarks : 0;
      return {
        topic,
        ...e,
        percentage: Math.round(ratio * 10000) / 100,
        needsWork: e.maxMarks > 0 && ratio < TOPIC_NEEDS_WORK_THRESHOLD,
      };
    })
    .sort((a, b) => Number(b.needsWork) - Number(a.needsWork) || a.percentage - b.percentage || a.topic.localeCompare(b.topic));
}

export interface ClassQuestionInput {
  questionId: string;
  title: string;
  difficulty: string;
  topics: string[];
  maxMarks: number;
  marksObtained: number;
  status: 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';
}

/** One finalized attempt's breakdown, as produced by computeFullBreakdown. */
export interface ClassAttemptInput {
  percentage: number;
  questions: ClassQuestionInput[];
  topics: TopicResultDetail[];
}

export interface ClassQuestionSummary {
  questionId: string;
  title: string;
  difficulty: string;
  topics: string[];
  maxMarks: number;
  attempted: number;
  solved: number;
  averageMarks: number;
  solveRate: number;
}

export interface ClassTopicSummary {
  topic: string;
  averagePercentage: number;
  studentsNeedingWork: number;
  students: number;
}

export interface ClassResultsSummary {
  completed: number;
  averagePercentage: number | null;
  highestPercentage: number | null;
  lowestPercentage: number | null;
  questions: ClassQuestionSummary[];
  topics: ClassTopicSummary[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Class-level view of an assessment, aggregated from every finalized attempt's own
 * breakdown — the same per-attempt numbers each student sees, so the class view can
 * never disagree with an individual result. `questionOrder` is the assessment's
 * question order, so questions nobody reached still appear (0 attempted), not vanish.
 *
 * Per topic: the mean of each student's topic percentage, and how many students had
 * that topic flagged `needsWork` (the same rule as the student's own result page).
 * Topics are ordered weakest-first — what an instructor would reteach first.
 */
export function aggregateClassResults(
  questionOrder: Omit<ClassQuestionInput, 'marksObtained' | 'status'>[],
  attempts: ClassAttemptInput[],
): ClassResultsSummary {
  const completed = attempts.length;

  const questions = questionOrder.map((q) => {
    let attempted = 0;
    let solved = 0;
    let marks = 0;
    for (const a of attempts) {
      const row = a.questions.find((r) => r.questionId === q.questionId);
      if (!row) continue;
      if (row.status !== 'NOT_ATTEMPTED') attempted += 1;
      if (row.status === 'SOLVED') solved += 1;
      marks += row.marksObtained;
    }
    return {
      ...q,
      attempted,
      solved,
      averageMarks: completed > 0 ? round2(marks / completed) : 0,
      solveRate: completed > 0 ? round2((solved / completed) * 100) : 0,
    };
  });

  const topicStats = new Map<string, { sum: number; students: number; needsWork: number }>();
  for (const a of attempts) {
    for (const t of a.topics) {
      const entry = topicStats.get(t.topic) ?? { sum: 0, students: 0, needsWork: 0 };
      entry.sum += t.percentage;
      entry.students += 1;
      if (t.needsWork) entry.needsWork += 1;
      topicStats.set(t.topic, entry);
    }
  }
  const topics = [...topicStats.entries()]
    .map(([topic, e]) => ({
      topic,
      averagePercentage: round2(e.sum / e.students),
      studentsNeedingWork: e.needsWork,
      students: e.students,
    }))
    .sort((a, b) => a.averagePercentage - b.averagePercentage || b.studentsNeedingWork - a.studentsNeedingWork || a.topic.localeCompare(b.topic));

  const percentages = attempts.map((a) => a.percentage);
  return {
    completed,
    averagePercentage: completed > 0 ? round2(percentages.reduce((s, p) => s + p, 0) / completed) : null,
    highestPercentage: completed > 0 ? Math.max(...percentages) : null,
    lowestPercentage: completed > 0 ? Math.min(...percentages) : null,
    questions,
    topics,
  };
}

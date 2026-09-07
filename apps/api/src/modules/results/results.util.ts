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

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, ListResultsQueryInput } from '@technical-platform/shared';
import type { Assessment, Attempt, Prisma } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toNum } from '../assessments/dto/assessment.dto.js';
import { computeEffectiveStatus } from '../assessments/utils/assessment-status.util.js';
import { resolveQuestionMarks } from '../scoring/scoring.util.js';
import { toAdminResultListItem, toOverallResult } from './dto/result.dto.js';
import { aggregateQuestionOutcomes, type QuestionOutcome } from './results.util.js';

export type FinalizeReason = 'MANUAL' | 'EXPIRY';

const ASSESSMENT_STRUCTURE_INCLUDE = {
  sections: {
    include: {
      questions: { include: { question: { select: { id: true, title: true, type: true, difficulty: true, marks: true } } } },
    },
  },
} satisfies Prisma.AssessmentInclude;

type AssessmentStructure = Assessment & {
  sections: Array<{
    id: string;
    title: string;
    orderIndex: number;
    questions: Array<{
      questionId: string;
      marksOverride: Prisma.Decimal | null;
      orderIndex: number;
      question: { id: string; title: string; type: string; difficulty: string; marks: Prisma.Decimal };
    }>;
  }>;
};

type McqResponseRow = { questionId: string; score: unknown; isCorrect: boolean | null };

export interface QuestionResultDetail {
  questionId: string;
  title: string;
  difficulty: string;
  maxMarks: number;
  marksObtained: number;
  status: 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'SOLVED';
  verdict: string | null;
  submissionCount: number;
}

export interface SectionResultDetail {
  sectionId: string;
  title: string;
  maxMarks: number;
  marksObtained: number;
  totalQuestions: number;
  solvedQuestions: number;
  questions: QuestionResultDetail[];
}

export interface FullBreakdown {
  totalScore: number;
  maxScore: number;
  percentage: number;
  codingScore: number;
  mcqScore: number;
  questionsAttempted: number;
  questionsSolved: number;
  submissionCount: number;
  timeTakenSeconds: number;
  totalQuestions: number;
  sections: SectionResultDetail[];
}

/**
 * The single authoritative computation: assessment structure + this attempt's
 * submissions/MCQ responses -> every number Phase 8 ever reports. Called by
 * `finalizeAttempt` (which persists only the scalar subset — see the module
 * doc comment below) and by `ResultsService`'s detail builders (which also
 * need the per-section/per-question arrays for display). One function, one
 * set of rules, reused everywhere — never recompute a score a second way.
 */
function computeFullBreakdown(
  assessment: AssessmentStructure,
  outcomes: Map<string, QuestionOutcome>,
  mcqResponses: McqResponseRow[],
  attempt: Pick<Attempt, 'startedAt' | 'submittedAt'>,
): FullBreakdown {
  const sections: SectionResultDetail[] = [];
  let codingScore = 0;
  let maxScore = 0;
  let questionsAttempted = 0;
  let questionsSolved = 0;
  let totalQuestions = 0;

  const sortedSections = assessment.sections.slice().sort((a, b) => a.orderIndex - b.orderIndex);
  for (const section of sortedSections) {
    let sectionMax = 0;
    let sectionObtained = 0;
    let sectionSolved = 0;
    const questions: QuestionResultDetail[] = [];

    const sortedQuestions = section.questions.slice().sort((a, b) => a.orderIndex - b.orderIndex);
    for (const aq of sortedQuestions) {
      totalQuestions++;
      const marks = resolveQuestionMarks(aq.marksOverride, aq.question.marks);
      sectionMax += marks;
      maxScore += marks;

      let marksObtained = 0;
      let status: QuestionResultDetail['status'] = 'NOT_ATTEMPTED';
      let verdict: string | null = null;
      let submissionCount = 0;

      if (aq.question.type === 'CODING') {
        const outcome = outcomes.get(aq.questionId);
        const solved = outcome?.solved ?? false;
        const attempted = outcome?.attempted ?? false;
        verdict = outcome?.latestSubmitVerdict ?? null;
        submissionCount = outcome?.submissionCount ?? 0;
        if (solved) {
          marksObtained = marks;
          status = 'SOLVED';
          codingScore += marks;
          questionsSolved++;
          questionsAttempted++;
        } else if (attempted) {
          status = 'ATTEMPTED';
          questionsAttempted++;
        }
      } else {
        // MCQ — Phase 11 hasn't built the answer/scoring flow yet, so
        // `mcqResponses` is always empty today; this branch is wired against
        // the real schema (mcq_responses.score/is_correct) so it needs no
        // rework once that phase lands.
        const response = mcqResponses.find((r) => r.questionId === aq.questionId);
        const attempted = response !== undefined;
        const solved = response?.isCorrect === true;
        marksObtained = response ? toNum(response.score) : 0;
        status = solved ? 'SOLVED' : attempted ? 'ATTEMPTED' : 'NOT_ATTEMPTED';
        if (attempted) questionsAttempted++;
        if (solved) questionsSolved++;
      }

      sectionObtained += marksObtained;
      if (status === 'SOLVED') sectionSolved++;

      questions.push({
        questionId: aq.questionId,
        title: aq.question.title,
        difficulty: aq.question.difficulty,
        maxMarks: marks,
        marksObtained,
        status,
        verdict,
        submissionCount,
      });
    }

    sections.push({
      sectionId: section.id,
      title: section.title,
      maxMarks: sectionMax,
      marksObtained: sectionObtained,
      totalQuestions: questions.length,
      solvedQuestions: sectionSolved,
      questions,
    });
  }

  const mcqScore = mcqResponses.reduce((sum, r) => sum + toNum(r.score), 0);
  const totalScore = codingScore + mcqScore;
  // Guard against divide-by-zero (an assessment somehow attached with 0 total
  // marks) — 0%, never NaN/Infinity (Part 7: "Percentage must correctly
  // handle zero maximum marks").
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
  const submissionCount = [...outcomes.values()].reduce((sum, o) => sum + o.submissionCount, 0);
  const timeTakenSeconds = attempt.submittedAt
    ? Math.max(0, Math.floor((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000))
    : 0;

  return {
    totalScore,
    maxScore,
    percentage,
    codingScore,
    mcqScore,
    questionsAttempted,
    questionsSolved,
    submissionCount,
    timeTakenSeconds,
    totalQuestions,
    sections,
  };
}

/**
 * Attempt finalization (docs/assessment-system.md §5). Triggered by (a) the
 * student's own `POST /assessments/:id/submit` (reason: MANUAL), (b) the
 * expiry sweep or a self-heal on read (reason: EXPIRY). Idempotent by
 * construction:
 *   - The attempt's IN_PROGRESS -> SUBMITTED/AUTO_SUBMITTED transition is an
 *     atomic compare-and-swap (`updateMany` with a `status: 'IN_PROGRESS'`
 *     guard in the WHERE clause) — only the first caller to reach it actually
 *     flips the row, so `submittedAt` always reflects the true first
 *     finalization moment even if two triggers race (a student clicking
 *     Submit right as the expiry sweep reaches the same attempt).
 *   - The score computation is a pure function of (assessment structure,
 *     submissions, mcq responses) — none of which can change after an
 *     attempt is finalized (marksOverride edits are blocked once an
 *     assessment leaves DRAFT; submissions are immutable rows) — so it always
 *     produces the same answer. Persisting it via `upsert` (keyed on the
 *     unique `attemptId`) means calling this function any number of times,
 *     concurrently or sequentially, never creates a duplicate `results` row
 *     and never corrupts data — it just recomputes and overwrites with the
 *     identical result (or repairs a missing row).
 *
 * Exported as a plain function (not a class method) so `AssessmentsService`
 * can call it directly without a NestJS module-level dependency on
 * `ResultsModule` — the same cross-module-reuse pattern already used for
 * `ensureAttemptFreshness` (see `assessments/assessments.service.ts`).
 */
export async function finalizeAttempt(prisma: PrismaService, attemptId: string, reason: FinalizeReason) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new NotFoundException('Attempt not found');

  if (attempt.status === 'IN_PROGRESS') {
    const targetStatus = reason === 'MANUAL' ? 'SUBMITTED' : 'AUTO_SUBMITTED';
    await prisma.attempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: { status: targetStatus, submittedAt: new Date() },
    });
  }

  const freshAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: freshAttempt.assessmentId },
    include: ASSESSMENT_STRUCTURE_INCLUDE,
  });

  const [submissions, mcqResponses] = await Promise.all([
    prisma.submission.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
      select: { questionId: true, kind: true, status: true, createdAt: true },
    }),
    prisma.mcqResponse.findMany({ where: { attemptId }, select: { questionId: true, score: true, isCorrect: true } }),
  ]);

  const outcomes = aggregateQuestionOutcomes(submissions);
  const breakdown = computeFullBreakdown(assessment as AssessmentStructure, outcomes, mcqResponses, freshAttempt);
  const {
    totalScore,
    maxScore,
    percentage,
    codingScore,
    mcqScore,
    questionsAttempted,
    questionsSolved,
    submissionCount,
    timeTakenSeconds,
  } = breakdown;

  const result = await prisma.result.upsert({
    where: { attemptId },
    create: {
      attemptId,
      assessmentId: freshAttempt.assessmentId,
      userId: freshAttempt.userId,
      totalScore,
      maxScore,
      percentage,
      codingScore,
      mcqScore,
      questionsAttempted,
      questionsSolved,
      timeTakenSeconds,
      submissionCount,
      finalizedAt: new Date(),
    },
    update: {
      totalScore,
      maxScore,
      percentage,
      codingScore,
      mcqScore,
      questionsAttempted,
      questionsSolved,
      timeTakenSeconds,
      submissionCount,
      finalizedAt: new Date(),
    },
  });

  await recomputeRanks(prisma, freshAttempt.assessmentId);
  return result;
}

/**
 * assessment-system.md §5 step 6. Tie-break: earlier final-submission time
 * wins (implementation-plan.md flagged this as an open decision — documented
 * here as the chosen rule, matching the conventional competitive-programming
 * default). Cheap at MVP scale: one query + N single-row updates for however
 * many attempts in this assessment have finalized so far.
 */
async function recomputeRanks(prisma: PrismaService, assessmentId: string): Promise<void> {
  const results = await prisma.result.findMany({
    where: { assessmentId },
    include: { attempt: { select: { submittedAt: true } } },
  });
  if (results.length === 0) return;

  const sorted = results.slice().sort((a, b) => {
    const scoreDiff = toNum(b.totalScore) - toNum(a.totalScore);
    if (scoreDiff !== 0) return scoreDiff;
    const aTime = a.attempt.submittedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = b.attempt.submittedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });

  await prisma.$transaction(sorted.map((r, index) => prisma.result.update({ where: { id: r.id }, data: { rank: index + 1 } })));
}

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  finalize(attemptId: string, reason: FinalizeReason) {
    return finalizeAttempt(this.prisma, attemptId, reason);
  }

  /**
   * GET /assessments/:id/result — STUDENT (own result only).
   *
   * Visibility rule (Phase 8 Part 8 — no explicit config exists for this in
   * the current schema/docs, so this is the documented safe default chosen
   * here): results are withheld until the *assessment's* window has ended
   * (`effectiveStatus` COMPLETED/ARCHIVED), not just the student's own
   * attempt. An assessment has one shared window but each student's attempt
   * can finish independently (early submit, or an individually-earlier
   * `endsAt` from `min(startedAt + duration, assessment.endAt)`) — if an
   * early finisher could see their score while the assessment is still
   * ACTIVE for other students, they could leak hints (e.g. "test 3 uses
   * negatives") to peers still taking it. Gating on the assessment's own
   * window, not the attempt's, closes that regardless of who finishes when.
   */
  async getStudentResult(user: AuthenticatedUser, assessmentId: string) {
    const participant = await this.prisma.assessmentParticipant.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: user.id } },
    });
    // Not found, not forbidden — matches the ownership-check pattern used
    // throughout this codebase (docs/security.md §1).
    if (!participant) throw new NotFoundException('Assessment not found');

    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const attempt = await this.prisma.attempt.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: user.id } },
    });
    if (!attempt) throw new NotFoundException('You have not attempted this assessment');

    const effectiveStatus = computeEffectiveStatus(assessment);
    if (effectiveStatus !== 'COMPLETED' && effectiveStatus !== 'ARCHIVED') {
      throw new ConflictException('Results are not available until the assessment window has ended');
    }

    const finalizedAttempt = await this.ensureFinalized(attempt);
    return this.buildResultResponse(assessment, finalizedAttempt);
  }

  /**
   * GET /assessments/:id/results — ADMIN roster, paginated. Built from every
   * assigned *participant* (not just those who attempted) so a student who
   * never started shows up as NOT_STARTED rather than silently missing — an
   * admin auditing "who hasn't done this yet" needs that row to exist.
   * Reads the persisted `results` scalars (see toAdminResultListItem) rather
   * than recomputing per row, so listing stays cheap regardless of how many
   * attempts have already been graded.
   */
  async listResults(assessmentId: string, query: ListResultsQueryInput) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const [participants, attempts] = await Promise.all([
      this.prisma.assessmentParticipant.findMany({
        where: { assessmentId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.attempt.findMany({
        where: { assessmentId },
        include: { result: { select: { totalScore: true, maxScore: true, percentage: true } } },
      }),
    ]);
    const attemptByUser = new Map(attempts.map((a) => [a.userId, a]));

    let rows = participants
      .map((p) => toAdminResultListItem(p, attemptByUser.get(p.userId) ?? null))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));

    if (query.status) {
      rows = rows.filter((r) => r.attemptStatus === query.status);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      rows = rows.filter(
        (r) => r.studentName.toLowerCase().includes(needle) || r.studentEmail.toLowerCase().includes(needle),
      );
    }

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    const page = rows.slice(start, start + query.pageSize);

    return {
      data: page,
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }

  /**
   * GET /assessments/:id/results/:attemptId — ADMIN detail. Unlike the
   * student endpoint, admins can view regardless of the assessment's window
   * (oversight is the whole point) and regardless of whether this specific
   * attempt has finalized — a genuinely still-in-progress attempt returns
   * `finalized: false` with no score fields, rather than a fabricated
   * in-progress score.
   */
  async getAdminResultDetail(assessmentId: string, attemptId: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, assessmentId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const student = { id: attempt.user.id, name: attempt.user.name, email: attempt.user.email };

    if (attempt.status === 'IN_PROGRESS' && attempt.endsAt > new Date()) {
      return {
        finalized: false as const,
        student,
        attemptStatus: attempt.status,
        startedAt: attempt.startedAt,
        endedAt: attempt.endsAt,
      };
    }

    const finalizedAttempt = await this.ensureFinalized(attempt);
    const response = await this.buildResultResponse(assessment, finalizedAttempt);
    return { finalized: true as const, student, ...response };
  }

  // ---- shared internals ----

  /** Finalizes on demand if needed (expired-but-not-yet-swept, or a Result
   * row missing for an already-finalized attempt) — see finalizeAttempt's own
   * doc comment for why this is always safe to call. */
  private async ensureFinalized(attempt: Attempt): Promise<Attempt> {
    if (attempt.status === 'IN_PROGRESS') {
      await finalizeAttempt(this.prisma, attempt.id, 'EXPIRY');
      return this.prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    }
    const existing = await this.prisma.result.findUnique({ where: { attemptId: attempt.id } });
    if (!existing) {
      await finalizeAttempt(this.prisma, attempt.id, attempt.status === 'SUBMITTED' ? 'MANUAL' : 'EXPIRY');
    }
    return attempt;
  }

  private async buildResultResponse(assessment: Assessment, attempt: Attempt) {
    const [structure, submissions, mcqResponses, result] = await Promise.all([
      this.prisma.assessment.findUniqueOrThrow({ where: { id: assessment.id }, include: ASSESSMENT_STRUCTURE_INCLUDE }),
      this.prisma.submission.findMany({
        where: { attemptId: attempt.id },
        orderBy: { createdAt: 'asc' },
        select: { questionId: true, kind: true, status: true, createdAt: true },
      }),
      this.prisma.mcqResponse.findMany({ where: { attemptId: attempt.id }, select: { questionId: true, score: true, isCorrect: true } }),
      this.prisma.result.findUnique({ where: { attemptId: attempt.id } }),
    ]);

    const outcomes = aggregateQuestionOutcomes(submissions);
    const breakdown = computeFullBreakdown(structure as AssessmentStructure, outcomes, mcqResponses, attempt);
    return toOverallResult(assessment, attempt, breakdown, result?.finalizedAt ?? null);
  }
}

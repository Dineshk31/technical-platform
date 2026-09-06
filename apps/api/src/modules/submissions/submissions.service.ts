import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, RunCodeInput } from '@technical-platform/shared';
import { ensureAttemptFreshness } from '../assessments/assessments.service.js';
import { toNum } from '../assessments/dto/assessment.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ExecutionClientService } from '../execution-client/execution-client.service.js';
import { toSubmissionDetail, toSubmissionSummary } from './dto/submission.dto.js';
import type { Attempt } from '../../../generated/prisma/index.js';

const TEST_RESULT_INCLUDE = {
  attempt: { select: { userId: true, assessmentId: true } },
  testResults: { include: { testCase: { select: { input: true, expectedOutput: true } } } },
} as const;

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionClient: ExecutionClientService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /attempts/:attemptId/questions/:questionId/run — Phase 6. Public test
   * cases only; never touches score (Run is a practice/debugging aid, not a
   * graded action — see docs/coding-engine.md §1).
   */
  async runCode(studentId: string, attemptId: string, questionId: string, input: RunCodeInput) {
    await this.validateAttemptForExecution(studentId, attemptId, questionId, input.language);

    const publicTestCaseCount = await this.prisma.codingTestCase.count({ where: { questionId, isHidden: false } });
    if (publicTestCaseCount === 0) {
      throw new UnprocessableEntityException('This question has no public test cases to run against');
    }

    await this.assertNotRateLimited(attemptId, questionId);
    return this.createSubmission(attemptId, questionId, 'RUN', input, publicTestCaseCount);
  }

  /**
   * POST /attempts/:attemptId/questions/:questionId/submit — Phase 7. Runs
   * public + hidden test cases (docs/coding-engine.md §3, §5) via the same
   * execution-service architecture as Run — `loadTestCases` in
   * execution-service already branches on `kind` to decide whether hidden
   * cases are included, and `judge.ts` already withholds hidden
   * `actualOutput`, so nothing there needs to change for Phase 7. This is a
   * real, immutable graded submission: every check below is server-side and
   * re-derived from the database, exactly like Run (never trusts the client).
   */
  async submitCode(studentId: string, attemptId: string, questionId: string, input: RunCodeInput) {
    await this.validateAttemptForExecution(studentId, attemptId, questionId, input.language);

    // Publish-time validation already guarantees every attached coding question has
    // ≥1 public and ≥1 hidden test case (AssessmentsService.publish) — this is a
    // defensive re-check, not a path expected to ever trigger in practice.
    const totalTestCaseCount = await this.prisma.codingTestCase.count({ where: { questionId } });
    if (totalTestCaseCount === 0) {
      throw new UnprocessableEntityException('This question has no test cases configured');
    }

    await this.assertNotRateLimited(attemptId, questionId);
    return this.createSubmission(attemptId, questionId, 'SUBMIT', input, totalTestCaseCount);
  }

  /** GET /submissions/:id — the student polls this until status leaves PENDING/RUNNING. */
  async getSubmission(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: TEST_RESULT_INCLUDE,
    });
    if (!submission) throw new NotFoundException('Submission not found');

    if (user.role !== 'ADMIN' && submission.attempt.userId !== user.id) {
      // Not found, not forbidden — matches the ownership-check pattern used
      // throughout AssessmentsService, so submission ids never become an oracle
      // for "does this id exist" to a student who doesn't own it.
      throw new NotFoundException('Submission not found');
    }

    const marks =
      submission.kind === 'SUBMIT' ? await this.getEffectiveMarks(submission.attempt.assessmentId, submission.questionId) : 0;
    return toSubmissionDetail(submission, marks);
  }

  /**
   * GET /attempts/:attemptId/questions/:questionId/submissions — Phase 7.
   * Safe summary only (no per-test-case detail, no hidden data): id, kind,
   * language, status, score, pass counts, timestamps. Both RUN and SUBMIT
   * rows are returned (kind-labeled) so the frontend can show one combined
   * history the way HackerRank/LeetCode do, without a second endpoint.
   */
  async getSubmissionHistory(user: AuthenticatedUser, attemptId: string, questionId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { userId: true, assessmentId: true },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (user.role !== 'ADMIN' && attempt.userId !== user.id) {
      throw new NotFoundException('Attempt not found');
    }

    const submissions = await this.prisma.submission.findMany({
      where: { attemptId, questionId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        language: true,
        status: true,
        testsPassed: true,
        testsTotal: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const hasSubmit = submissions.some((s) => s.kind === 'SUBMIT');
    const marks = hasSubmit ? await this.getEffectiveMarks(attempt.assessmentId, questionId) : 0;
    return submissions.map((s) => toSubmissionSummary(s, marks));
  }

  // ============ shared helpers ============

  /**
   * Every check Run and Submit have in common: ownership, freshness (server-
   * authoritative — never trusts the client timer/status), attempt is still
   * IN_PROGRESS, the question actually belongs to this attempt's assessment,
   * and the requested language is one this question supports. Extracted here
   * (Phase 7) so Submit doesn't duplicate Run's validation chain — the two
   * only ever diverge on which test cases run and what gets persisted.
   */
  private async validateAttemptForExecution(
    studentId: string,
    attemptId: string,
    questionId: string,
    language: RunCodeInput['language'],
  ): Promise<{ attempt: Attempt }> {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== studentId) throw new NotFoundException('Attempt not found');

    const fresh = await ensureAttemptFreshness(this.prisma, attempt);
    if (fresh.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        fresh.status === 'SUBMITTED'
          ? 'This attempt has already been submitted'
          : 'This attempt is no longer accepting changes',
      );
    }

    const assessmentQuestion = await this.prisma.assessmentQuestion.findFirst({
      where: { questionId, section: { assessmentId: fresh.assessmentId } },
      include: { question: { include: { codingQuestion: { include: { languages: true } } } } },
    });
    if (!assessmentQuestion) throw new NotFoundException('Question not found in this assessment');

    const codingQuestion = assessmentQuestion.question.codingQuestion;
    if (assessmentQuestion.question.type !== 'CODING' || !codingQuestion) {
      throw new UnprocessableEntityException('This question does not support code execution');
    }

    const supported = codingQuestion.languages.some((l) => l.language === language);
    if (!supported) {
      throw new UnprocessableEntityException(`This question does not support ${language}`);
    }

    return { attempt: fresh };
  }

  /**
   * Per-student-per-question throttling (docs/security.md §7) — applies across
   * Run *and* Submit combined (both hit the same execution-service queue), so
   * a student can't sidestep the Run throttle by alternating Run/Submit
   * clicks. Derived from real submission history, not an in-memory counter,
   * so it holds across API restarts/instances.
   */
  private async assertNotRateLimited(attemptId: string, questionId: string): Promise<void> {
    const rateLimitMs = this.config.get<number>('RUN_RATE_LIMIT_MS') ?? 2000;
    const last = await this.prisma.submission.findFirst({
      where: { attemptId, questionId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < rateLimitMs) {
      throw new HttpException(
        { error: { code: 'RATE_LIMITED', message: 'Please wait a moment before trying again' } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async createSubmission(
    attemptId: string,
    questionId: string,
    kind: 'RUN' | 'SUBMIT',
    input: RunCodeInput,
    testsTotal: number,
  ) {
    const { submission, job } = await this.prisma.$transaction(async (tx) => {
      const createdSubmission = await tx.submission.create({
        data: {
          attemptId,
          questionId,
          kind,
          language: input.language,
          code: input.code,
          status: 'PENDING',
          testsTotal,
        },
      });
      const createdJob = await tx.executionJob.create({
        data: { submissionId: createdSubmission.id, status: 'QUEUED' },
      });
      return { submission: createdSubmission, job: createdJob };
    });

    // Fire-and-forget: a failed notify never fails the Run/Submit click — the
    // execution-service's own poller will still pick this job up (docs/coding-engine.md §3).
    void this.executionClient.notify(job.id);

    return { submissionId: submission.id, status: submission.status, testsTotal: submission.testsTotal, kind: submission.kind };
  }

  /**
   * The marks this question is worth *in this specific assessment*
   * (assessmentQuestion.marksOverride, falling back to questions.marks) —
   * looked up here rather than trusted from anywhere upstream, and only ever
   * for SUBMIT kind, since Run is never graded. This is deliberately computed
   * by the API at read time rather than written by execution-service: the
   * execution-service's restricted DB role has no grant on `questions`
   * (see docs/security.md §4), so it structurally cannot know a question's
   * marks — scoring-by-marks has to happen on this side of that boundary.
   */
  private async getEffectiveMarks(assessmentId: string, questionId: string): Promise<number> {
    const assessmentQuestion = await this.prisma.assessmentQuestion.findFirst({
      where: { questionId, section: { assessmentId } },
      include: { question: { select: { marks: true } } },
    });
    if (!assessmentQuestion) return 0;
    return toNum(assessmentQuestion.marksOverride ?? assessmentQuestion.question.marks);
  }
}

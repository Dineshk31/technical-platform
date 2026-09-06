import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, RunCodeInput } from '@technical-platform/shared';
import { ensureAttemptFreshness } from '../assessments/assessments.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ExecutionClientService } from '../execution-client/execution-client.service.js';
import { toSubmissionDetail } from './dto/submission.dto.js';

const TEST_RESULT_INCLUDE = {
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
   * POST /attempts/:attemptId/questions/:questionId/run — Phase 6. Never
   * trusts questionId/attemptId/language/frontend state (docs' explicit
   * requirement): every check below re-derives the truth from the database.
   */
  async runCode(studentId: string, attemptId: string, questionId: string, input: RunCodeInput) {
    // 1+2. Authentication is enforced by the JwtAuthGuard before this ever runs;
    // "student owns the attempt" is this ownership check — not found (not
    // forbidden) so an attempt id belonging to another student can't even be
    // distinguished from a nonexistent one (docs/security.md §1 pattern, matches
    // AssessmentsService.getAttemptDetail/saveAttemptDraft).
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== studentId) throw new NotFoundException('Attempt not found');

    // 4. Attempt must be IN_PROGRESS — re-checked freshly (server-authoritative
    // timing; never trusts the client timer), same lazy-expiry sweep every other
    // attempt-scoped write path uses.
    const fresh = await ensureAttemptFreshness(this.prisma, attempt);
    if (fresh.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        fresh.status === 'SUBMITTED'
          ? 'This attempt has already been submitted'
          : 'This attempt is no longer accepting changes',
      );
    }

    // 3+5. "attempt belongs to an assessment assigned to the student" is implied by
    // step 1 (an Attempt row only ever exists after AssessmentsService.startAttempt,
    // which itself requires an AssessmentParticipant row); "question belongs to the
    // assessment" is this lookup — a questionId for a real question in a different
    // assessment is rejected exactly like a made-up one.
    const assessmentQuestion = await this.prisma.assessmentQuestion.findFirst({
      where: { questionId, section: { assessmentId: attempt.assessmentId } },
      include: { question: { include: { codingQuestion: { include: { languages: true } } } } },
    });
    if (!assessmentQuestion) throw new NotFoundException('Question not found in this assessment');

    const codingQuestion = assessmentQuestion.question.codingQuestion;
    if (assessmentQuestion.question.type !== 'CODING' || !codingQuestion) {
      throw new UnprocessableEntityException('This question does not support code execution');
    }

    // 6. Selected language must be one this question actually offers.
    const supported = codingQuestion.languages.some((l) => l.language === input.language);
    if (!supported) {
      throw new UnprocessableEntityException(`This question does not support ${input.language}`);
    }

    const publicTestCaseCount = await this.prisma.codingTestCase.count({ where: { questionId, isHidden: false } });
    if (publicTestCaseCount === 0) {
      throw new UnprocessableEntityException('This question has no public test cases to run against');
    }

    // Per-student-per-question throttling (docs/security.md §7) — prevents a
    // scripted flood (or panicked repeated clicking) from starving the
    // execution-service queue during a live exam. Derived from real submission
    // history, not an in-memory counter, so it holds across API restarts/instances.
    const rateLimitMs = this.config.get<number>('RUN_RATE_LIMIT_MS') ?? 2000;
    const lastRun = await this.prisma.submission.findFirst({
      where: { attemptId, questionId, kind: 'RUN' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (lastRun && Date.now() - lastRun.createdAt.getTime() < rateLimitMs) {
      throw new HttpException(
        { error: { code: 'RATE_LIMITED', message: 'Please wait a moment before running again' } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { submission, job } = await this.prisma.$transaction(async (tx) => {
      const createdSubmission = await tx.submission.create({
        data: {
          attemptId,
          questionId,
          kind: 'RUN',
          language: input.language,
          code: input.code,
          status: 'PENDING',
          testsTotal: publicTestCaseCount,
        },
      });
      const createdJob = await tx.executionJob.create({
        data: { submissionId: createdSubmission.id, status: 'QUEUED' },
      });
      return { submission: createdSubmission, job: createdJob };
    });

    // Fire-and-forget: a failed notify never fails the Run Code click — the
    // execution-service's own poller will still pick this job up (docs/coding-engine.md §3).
    void this.executionClient.notify(job.id);

    return { submissionId: submission.id, status: submission.status, testsTotal: submission.testsTotal };
  }

  /** GET /submissions/:id — the student polls this until status leaves PENDING/RUNNING. */
  async getSubmission(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { attempt: { select: { userId: true } }, ...TEST_RESULT_INCLUDE },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    if (user.role !== 'ADMIN' && submission.attempt.userId !== user.id) {
      // Not found, not forbidden — matches the ownership-check pattern used
      // throughout AssessmentsService, so submission ids never become an oracle
      // for "does this id exist" to a student who doesn't own it.
      throw new NotFoundException('Submission not found');
    }

    return toSubmissionDetail(submission);
  }
}

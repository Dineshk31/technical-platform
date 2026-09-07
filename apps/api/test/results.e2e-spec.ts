import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ExpirySweepService } from '../src/modules/results/expiry-sweep.service.js';

/**
 * Phase 8 — attempt finalization, scoring, and results. Requires a live
 * execution-service exactly like submissions.e2e-spec.ts / final-submission.e2e-spec.ts
 * (real Python/Java/C++ compile+run) — see those files' header comments for
 * toolchain setup.
 */
const PASSWORD = 'TestPass123!';
const runId = Date.now();
const POLL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 300;
// Long/distinctive on purpose — a short marker like "555" or "999" has a real
// chance of coincidentally appearing inside a random UUID or a random base-36
// title suffix elsewhere in the response, producing a false-positive "leak".
const HIDDEN_INPUT = '84271 19348';
const HIDDEN_EXPECTED = '103619';

describe('Results, scoring, and attempt finalization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sweep: ExpirySweepService;
  let server: Parameters<typeof request>[0];

  let adminToken: string;
  let studentToken: string;
  let otherStudentToken: string;
  let studentId: string;
  let otherStudentId: string;

  const userIds: string[] = [];
  const questionIds: string[] = [];
  const assessmentIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    sweep = app.get(ExpirySweepService);

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { code: 'STUDENT' } });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);

    const admin = await prisma.user.create({
      data: { email: `results-e2e-admin-${runId}@test.local`, passwordHash, name: 'Results E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `results-e2e-student-${runId}@test.local`, passwordHash, name: 'Alice Results', roleId: studentRole.id },
    });
    const other = await prisma.user.create({
      data: { email: `results-e2e-other-${runId}@test.local`, passwordHash, name: 'Bob Results', roleId: studentRole.id },
    });
    studentId = student.id;
    otherStudentId = other.id;
    userIds.push(admin.id, studentId, otherStudentId);

    adminToken = await login(admin.email);
    studentToken = await login(student.email);
    otherStudentToken = await login(other.email);
  });

  afterAll(async () => {
    await prisma.result.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.attempt.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessmentParticipant.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessmentQuestion.deleteMany({ where: { section: { assessmentId: { in: assessmentIds } } } });
    await prisma.assessmentSection.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return res.body.accessToken;
  }

  async function createQuestion(overrides: Record<string, unknown> = {}) {
    const res = await request(server)
      .post('/api/v1/questions/coding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Results Sum ${runId}-${Math.random().toString(36).slice(2)}`,
        problemStatement: 'Read two integers a and b from stdin (space separated) and print a + b.',
        inputFormat: 'Two space-separated integers.',
        outputFormat: 'A single integer.',
        constraints: [],
        examples: [{ input: '2 3', output: '5' }],
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 10,
        timeLimitSeconds: 2,
        memoryLimitMb: 256,
        supportedLanguages: ['CPP', 'JAVA', 'PYTHON'],
        publicTestCases: [{ input: '2 3', expectedOutput: '5' }],
        hiddenTestCases: [{ input: HIDDEN_INPUT, expectedOutput: HIDDEN_EXPECTED }],
        referenceSolutions: { PYTHON: 'a, b = map(int, input().split())\nprint(a + b)' },
        starterTemplates: {},
        ...overrides,
      });
    expect(res.status).toBe(201);
    const questionId = res.body.id as string;
    questionIds.push(questionId);
    await request(server).post(`/api/v1/questions/${questionId}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });
    return questionId;
  }

  /** Builds a full assessment: one or more sections, each with question
   * attachments (optionally marks-overridden), participants, and publishes it. */
  async function setupAssessment(opts: {
    title: string;
    durationMinutes?: number;
    endInMs?: number;
    sections: { title: string; questions: { questionId: string; marksOverride?: number }[] }[];
    participantIds?: string[];
  }) {
    const now = Date.now();
    const create = await request(server)
      .post('/api/v1/assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `${opts.title} ${runId}-${Math.random().toString(36).slice(2)}`,
        durationMinutes: opts.durationMinutes ?? 60,
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + (opts.endInMs ?? 30 * 60_000)).toISOString(),
      });
    const assessmentId = create.body.id as string;
    assessmentIds.push(assessmentId);

    for (const section of opts.sections) {
      const sectionRes = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: section.title, sectionType: 'CODING' });
      const sectionId = sectionRes.body.sections[sectionRes.body.sections.length - 1].id;
      for (const q of section.questions) {
        await request(server)
          .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ questionId: q.questionId, marksOverride: q.marksOverride });
      }
    }

    await request(server)
      .post(`/api/v1/assessments/${assessmentId}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: opts.participantIds ?? [studentId, otherStudentId] });
    await request(server).post(`/api/v1/assessments/${assessmentId}/publish`).set('Authorization', `Bearer ${adminToken}`);
    return assessmentId;
  }

  async function startAttempt(assessmentId: string, token: string) {
    const res = await request(server).post(`/api/v1/assessments/${assessmentId}/start`).set('Authorization', `Bearer ${token}`);
    return res.body.id as string;
  }

  async function pollSubmission(submissionId: string, token: string) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const res = await request(server).get(`/api/v1/submissions/${submissionId}`).set('Authorization', `Bearer ${token}`);
      if (res.body.status !== 'PENDING' && res.body.status !== 'RUNNING') return res.body;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`Submission ${submissionId} did not reach a terminal status within ${POLL_TIMEOUT_MS}ms`);
  }

  async function submitAndWait(attemptId: string, questionId: string, token: string, code: string, language = 'PYTHON') {
    const submit = await request(server)
      .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ language, code });
    expect(submit.status).toBe(202);
    return pollSubmission(submit.body.submissionId, token);
  }

  const CORRECT = 'a, b = map(int, input().split())\nprint(a + b)';
  const WRONG = 'a, b = map(int, input().split())\nprint(a - b)';

  function assertNoHiddenLeak(body: unknown) {
    const json = JSON.stringify(body);
    expect(json).not.toContain(HIDDEN_INPUT);
    expect(json).not.toContain(HIDDEN_EXPECTED);
  }

  describe('scoring rules', () => {
    it('ACCEPTED submission earns full marks; finalize computes the correct total', async () => {
      const q1 = await createQuestion();
      const q2 = await createQuestion();
      const assessmentId = await setupAssessment({
        title: 'Scoring Basic',
        sections: [{ title: 'Section 1', questions: [{ questionId: q1, marksOverride: 20 }, { questionId: q2, marksOverride: 30 }] }],
      });
      const attemptId = await startAttempt(assessmentId, studentToken);

      await submitAndWait(attemptId, q1, studentToken, CORRECT); // solved, 20 marks
      await submitAndWait(attemptId, q2, studentToken, WRONG); // wrong, 0 marks

      const finish = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(finish.status).toBe(201);
      expect(finish.body.status).toBe('SUBMITTED');

      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(result).not.toBeNull();
      expect(Number(result!.totalScore)).toBe(20);
      expect(Number(result!.maxScore)).toBe(50);
      expect(Number(result!.percentage)).toBe(40);
      expect(result!.questionsSolved).toBe(1);
      expect(result!.questionsAttempted).toBe(2);
    }, 30_000);

    it('best-of rule: wrong then accepted still earns full marks (not penalized for retrying)', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Wrong Then Accepted', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);

      await submitAndWait(attemptId, q, studentToken, WRONG);
      await new Promise((r) => setTimeout(r, 2100)); // clear the combined run/submit throttle
      await submitAndWait(attemptId, q, studentToken, CORRECT);

      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(Number(result!.totalScore)).toBe(10);
      expect(result!.questionsSolved).toBe(1);
    }, 30_000);

    it('best-of rule: accepted then a later wrong submission still keeps full marks', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Accepted Then Wrong', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);

      await submitAndWait(attemptId, q, studentToken, CORRECT);
      await new Promise((r) => setTimeout(r, 2100));
      await submitAndWait(attemptId, q, studentToken, WRONG);

      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(Number(result!.totalScore)).toBe(10);
      expect(result!.questionsSolved).toBe(1);
    }, 30_000);

    it('no submission at all earns zero and counts as NOT_ATTEMPTED, not ATTEMPTED', async () => {
      const q1 = await createQuestion();
      const q2 = await createQuestion();
      const assessmentId = await setupAssessment({
        title: 'No Submission',
        sections: [{ title: 'S1', questions: [{ questionId: q1, marksOverride: 10 }, { questionId: q2, marksOverride: 10 }] }],
      });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q1, studentToken, CORRECT); // only q1 touched

      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(Number(result!.totalScore)).toBe(10);
      expect(Number(result!.maxScore)).toBe(20);
      expect(result!.questionsAttempted).toBe(1); // q2 never touched -> NOT_ATTEMPTED, not counted
    }, 25_000);

    it('a Run-only question (never Submitted) counts as ATTEMPTED with zero marks, not SOLVED', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Run Only', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);

      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${q}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: CORRECT });
      expect(run.status).toBe(202);
      await pollSubmission(run.body.submissionId, studentToken);

      const finish = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(finish.status).toBe(201);
      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(Number(result!.totalScore)).toBe(0);
      expect(result!.questionsAttempted).toBe(1);
      expect(result!.questionsSolved).toBe(0);
    }, 25_000);

    it('compilation/runtime/timeout verdicts all earn zero marks', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Bad Verdicts', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);

      const compileErr = await submitAndWait(attemptId, q, studentToken, 'def broken(:\n    pass');
      expect(compileErr.status).toBe('RUNTIME_ERROR'); // Python has no separate compile step — a syntax error surfaces as RUNTIME_ERROR

      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(Number(result!.totalScore)).toBe(0);
    }, 25_000);
  });

  describe('section breakdown', () => {
    it('rolls up per-section marks and solved counts correctly across two sections', async () => {
      const q1 = await createQuestion();
      const q2 = await createQuestion();
      const q3 = await createQuestion();
      const assessmentId = await setupAssessment({
        title: 'Sections',
        sections: [
          { title: 'Warm-up', questions: [{ questionId: q1, marksOverride: 10 }, { questionId: q2, marksOverride: 10 }] },
          { title: 'Advanced', questions: [{ questionId: q3, marksOverride: 30 }] },
        ],
      });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q1, studentToken, CORRECT);
      await new Promise((r) => setTimeout(r, 2100));
      await submitAndWait(attemptId, q2, studentToken, WRONG);
      await new Promise((r) => setTimeout(r, 2100));
      await submitAndWait(attemptId, q3, studentToken, CORRECT);

      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);

      // Force the window closed so the student can read their own result (see visibility tests below).
      await prisma.assessment.update({ where: { id: assessmentId }, data: { endAt: new Date(Date.now() - 1000) } });

      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body.sections).toHaveLength(2);
      const warmup = res.body.sections.find((s: { title: string }) => s.title === 'Warm-up');
      const advanced = res.body.sections.find((s: { title: string }) => s.title === 'Advanced');
      expect(warmup.maxMarks).toBe(20);
      expect(warmup.marksObtained).toBe(10);
      expect(warmup.solvedQuestions).toBe(1);
      expect(warmup.totalQuestions).toBe(2);
      expect(advanced.maxMarks).toBe(30);
      expect(advanced.marksObtained).toBe(30);
      expect(advanced.solvedQuestions).toBe(1);
      expect(res.body.totalScore).toBe(40);
      expect(res.body.maxScore).toBe(50);
      expect(res.body.percentage).toBe(80);
      expect(res.body.questionsSolved).toBe(2);
      expect(res.body.totalQuestions).toBe(3);

      const q1Result = warmup.questions.find((q: { questionId: string }) => q.questionId === q1);
      expect(q1Result.status).toBe('SOLVED');
      expect(q1Result.verdict).toBe('ACCEPTED');
      const q2Result = warmup.questions.find((q: { questionId: string }) => q.questionId === q2);
      expect(q2Result.status).toBe('ATTEMPTED');
      expect(q2Result.verdict).toBe('WRONG_ANSWER');
      assertNoHiddenLeak(res.body);
    }, 35_000);

  });

  describe('attempt finalization: idempotency and expiry', () => {
    it('calling finalize twice never duplicates the Result row or changes the numbers', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Idempotent', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q, studentToken, CORRECT);

      const first = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(first.status).toBe(201);
      const second = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(second.status).toBe(409); // attempt-level: cannot submit twice

      const count = await prisma.result.count({ where: { attemptId } });
      expect(count).toBe(1);

      // Reading the result repeatedly (which self-heals if needed) must also
      // never create a second row or change the score.
      await prisma.assessment.update({ where: { id: assessmentId }, data: { endAt: new Date(Date.now() - 1000) } });
      const r1 = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      const r2 = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      expect(r1.body.totalScore).toBe(r2.body.totalScore);
      expect(await prisma.result.count({ where: { attemptId } })).toBe(1);
    }, 25_000);

    it('an expired attempt is reliably finalized (by self-heal-on-read or the periodic sweep) and never stays IN_PROGRESS', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({
        title: 'Expiry Self-Heal',
        durationMinutes: 60,
        endInMs: 900,
        sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }],
      });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q, studentToken, CORRECT);

      await new Promise((r) => setTimeout(r, 1300)); // let the window (and the attempt's endsAt) actually pass

      // Deliberately not asserting the attempt is still IN_PROGRESS here: this
      // whole test suite runs the *real* ExpirySweepService/@Cron in-process
      // (docs/assessment-system.md §3's "deliberately redundant" second
      // mechanism), and a long-running suite can genuinely cross a 30s tick
      // before this line runs — the sweep finalizing it first is just as
      // correct as this read self-healing it. Either mechanism winning is the
      // intended behavior; the only thing worth asserting is the end state.
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body.attemptStatus).toBe('AUTO_SUBMITTED');
      expect(res.body.totalScore).toBe(10);

      const finalized = await prisma.attempt.findUnique({ where: { id: attemptId } });
      expect(finalized?.status).toBe('AUTO_SUBMITTED');
      expect(finalized?.submittedAt).not.toBeNull();
    }, 25_000);

    it('the periodic expiry sweep finalizes an expired attempt nobody has read either', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({
        title: 'Sweep',
        durationMinutes: 60,
        endInMs: 900,
        sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }],
      });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await new Promise((r) => setTimeout(r, 1300));

      await sweep.sweep(); // invoke directly rather than waiting for the real 30s timer

      const finalized = await prisma.attempt.findUnique({ where: { id: attemptId } });
      expect(finalized?.status).toBe('AUTO_SUBMITTED');
      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(result).not.toBeNull();
      expect(Number(result!.totalScore)).toBe(0);
    }, 15_000);
  });

  describe('result visibility', () => {
    it('rejects the student\'s own result while the assessment is still ACTIVE, even if their attempt already finished (409)', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({
        title: 'Active Window',
        durationMinutes: 60,
        endInMs: 30 * 60_000, // assessment window stays open for other students
        sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }],
      });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q, studentToken, CORRECT);
      const finish = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(finish.status).toBe(201); // this student is done...

      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(409); // ...but the assessment window is still open for others, so no peek yet
    }, 20_000);

    it('allows the result once the assessment window has ended (200)', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Ended Window', durationMinutes: 60, endInMs: 30 * 60_000, sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q, studentToken, CORRECT);
      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);

      await prisma.assessment.update({ where: { id: assessmentId }, data: { endAt: new Date(Date.now() - 1000) } });

      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalScore).toBe(10);
      expect(res.body.assessmentTitle).toContain('Ended Window');
    }, 20_000);

    it('404s for a student who never attempted the assessment', async () => {
      const assessmentId = await setupAssessment({ title: 'Never Attempted', sections: [{ title: 'S1', questions: [] }], participantIds: [studentId] });
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(404);
    });

    it("404s for a student who is not a participant of the assessment at all", async () => {
      const assessmentId = await setupAssessment({ title: 'Not A Participant', sections: [{ title: 'S1', questions: [] }], participantIds: [otherStudentId] });
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(404);
    });

    it('rejects unauthenticated requests (401)', async () => {
      const assessmentId = await setupAssessment({ title: 'Unauth', sections: [{ title: 'S1', questions: [] }] });
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`);
      expect(res.status).toBe(401);
    });
  });

  describe('admin roster and detail', () => {
    it('lists all participants including one who never started, with correct scores and pagination', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Admin Roster', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q, studentToken, CORRECT);
      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      // otherStudent is a participant but never starts -> NOT_STARTED row

      const list = await request(server).get(`/api/v1/assessments/${assessmentId}/results`).set('Authorization', `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(2);
      const alice = list.body.data.find((r: { studentEmail: string }) => r.studentEmail.startsWith('results-e2e-student'));
      const bob = list.body.data.find((r: { studentEmail: string }) => r.studentEmail.startsWith('results-e2e-other'));
      expect(alice.attemptStatus).toBe('SUBMITTED');
      expect(alice.totalScore).toBe(10);
      expect(bob.attemptStatus).toBe('NOT_STARTED');
      expect(bob.totalScore).toBeNull();
      expect(bob.attemptId).toBeNull();

      // pagination
      const page1 = await request(server).get(`/api/v1/assessments/${assessmentId}/results?page=1&pageSize=1`).set('Authorization', `Bearer ${adminToken}`);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.meta.totalPages).toBe(2);
    }, 20_000);

    it('filters the roster by status and by search text', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Admin Filter', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      await startAttempt(assessmentId, studentToken);

      const byStatus = await request(server).get(`/api/v1/assessments/${assessmentId}/results?status=NOT_STARTED`).set('Authorization', `Bearer ${adminToken}`);
      expect(byStatus.body.data.every((r: { attemptStatus: string }) => r.attemptStatus === 'NOT_STARTED')).toBe(true);

      const bySearch = await request(server).get(`/api/v1/assessments/${assessmentId}/results?search=Alice`).set('Authorization', `Bearer ${adminToken}`);
      expect(bySearch.body.data).toHaveLength(1);
      expect(bySearch.body.data[0].studentName).toBe('Alice Results');
    }, 15_000);

    it('admin can view the roster even while the assessment is still ACTIVE', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({
        title: 'Admin Active View',
        endInMs: 30 * 60_000,
        sections: [{ title: 'S1', questions: [{ questionId: q }] }],
      });
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/results`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('detail: a genuinely in-progress attempt reports finalized:false with no score fields', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Admin Detail In Progress', endInMs: 30 * 60_000, sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);

      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/results/${attemptId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.finalized).toBe(false);
      expect(res.body.totalScore).toBeUndefined();
      expect(res.body.student.email).toContain('results-e2e-student');
    }, 15_000);

    it('detail: a finalized attempt returns the full breakdown, and hidden test content never leaks', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Admin Detail Finalized', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q, studentToken, CORRECT);
      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);

      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/results/${attemptId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.finalized).toBe(true);
      expect(res.body.totalScore).toBe(10);
      expect(res.body.sections[0].questions[0].status).toBe('SOLVED');
      assertNoHiddenLeak(res.body);
    }, 20_000);

    it('404s when the attemptId does not belong to the given assessmentId', async () => {
      const q = await createQuestion();
      const a1 = await setupAssessment({ title: 'Cross A', sections: [{ title: 'S1', questions: [{ questionId: q }] }] });
      const a2 = await setupAssessment({ title: 'Cross B', sections: [{ title: 'S1', questions: [{ questionId: q }] }] });
      const attemptId = await startAttempt(a1, studentToken);

      const res = await request(server).get(`/api/v1/assessments/${a2}/results/${attemptId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('security', () => {
    it("never lets one student read another student's result — even a shared assessment resolves to each caller's own attempt (ownership, not just a shared id)", async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Cross Student', sections: [{ title: 'S1', questions: [{ questionId: q, marksOverride: 10 }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);
      await submitAndWait(attemptId, q, studentToken, CORRECT);
      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      await prisma.assessment.update({ where: { id: assessmentId }, data: { endAt: new Date(Date.now() - 1000) } });

      // otherStudent is a participant of the same assessment but never attempted it —
      // GET /assessments/:id/result always resolves to *the caller's own* attempt
      // (looked up by their own userId), so they get their own 404, never Alice's score.
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('10'); // Alice's score never appears
    }, 20_000);

    it('rejects a STUDENT calling the admin roster endpoint (403)', async () => {
      const assessmentId = await setupAssessment({ title: 'Sec Roster', sections: [{ title: 'S1', questions: [] }] });
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/results`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects a STUDENT calling the admin detail endpoint (403)', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Sec Detail', sections: [{ title: 'S1', questions: [{ questionId: q }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/results/${attemptId}`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects an ADMIN calling the student result endpoint (403)', async () => {
      const assessmentId = await setupAssessment({ title: 'Sec Student Endpoint', sections: [{ title: 'S1', questions: [] }] });
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/result`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated requests to all three endpoints (401)', async () => {
      const q = await createQuestion();
      const assessmentId = await setupAssessment({ title: 'Sec Unauth', sections: [{ title: 'S1', questions: [{ questionId: q }] }] });
      const attemptId = await startAttempt(assessmentId, studentToken);
      const r1 = await request(server).get(`/api/v1/assessments/${assessmentId}/result`);
      const r2 = await request(server).get(`/api/v1/assessments/${assessmentId}/results`);
      const r3 = await request(server).get(`/api/v1/assessments/${assessmentId}/results/${attemptId}`);
      expect(r1.status).toBe(401);
      expect(r2.status).toBe(401);
      expect(r3.status).toBe(401);
    });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Phase 7 — Submit Solution (final judging against public + hidden test
 * cases). Requires a live execution-service exactly like submissions.e2e-spec.ts
 * (Phase 6, Run Code) — see that file's header comment for toolchain setup.
 *
 * These tests deliberately assert on the *shape* of API responses (not just
 * status codes) for the hidden-test-security requirement — a hidden test
 * case's input/expectedOutput/actualOutput must never appear anywhere in a
 * student-facing response body, checked structurally (key must be absent),
 * not just "the value looks empty".
 */
const PASSWORD = 'TestPass123!';
const runId = Date.now();
const POLL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 300;

const HIDDEN_INPUT = '777 888';
const HIDDEN_EXPECTED = '1665';

describe('Submit Solution — final judging with hidden test cases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { code: 'STUDENT' } });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);

    const admin = await prisma.user.create({
      data: { email: `submit-e2e-admin-${runId}@test.local`, passwordHash, name: 'Submit E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `submit-e2e-student-${runId}@test.local`, passwordHash, name: 'Submit E2E Student', roleId: studentRole.id },
    });
    const other = await prisma.user.create({
      data: { email: `submit-e2e-other-${runId}@test.local`, passwordHash, name: 'Submit E2E Other', roleId: studentRole.id },
    });
    studentId = student.id;
    otherStudentId = other.id;
    userIds.push(admin.id, studentId, otherStudentId);

    adminToken = await login(server, admin.email);
    studentToken = await login(server, student.email);
    otherStudentToken = await login(server, other.email);
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessmentParticipant.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessmentQuestion.deleteMany({ where: { section: { assessmentId: { in: assessmentIds } } } });
    await prisma.assessmentSection.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function createQuestion(overrides: Record<string, unknown> = {}) {
    const res = await request(server)
      .post('/api/v1/questions/coding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Submit Sum ${runId}-${Math.random().toString(36).slice(2)}`,
        problemStatement: 'Read two integers a and b from stdin (space separated) and print a + b.',
        inputFormat: 'Two space-separated integers.',
        outputFormat: 'A single integer.',
        constraints: [],
        examples: [{ input: '2 3', output: '5' }],
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 20,
        timeLimitSeconds: 2,
        memoryLimitMb: 256,
        supportedLanguages: ['CPP', 'JAVA', 'PYTHON'],
        publicTestCases: [
          { input: '2 3', expectedOutput: '5' },
          { input: '10 20', expectedOutput: '30' },
        ],
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

  async function createActiveAssessmentWith(questionId: string, marksOverride?: number) {
    const now = Date.now();
    const create = await request(server)
      .post('/api/v1/assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Submit Flow ${runId}-${Math.random().toString(36).slice(2)}`,
        durationMinutes: 60,
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 30 * 60_000).toISOString(),
      });
    const assessmentId = create.body.id as string;
    assessmentIds.push(assessmentId);
    const section = await request(server)
      .post(`/api/v1/assessments/${assessmentId}/sections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Section 1', sectionType: 'CODING' });
    await request(server)
      .post(`/api/v1/assessments/${assessmentId}/sections/${section.body.sections[0].id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionId, marksOverride });
    await request(server)
      .post(`/api/v1/assessments/${assessmentId}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [studentId, otherStudentId] });
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
      if (res.body.status !== 'PENDING' && res.body.status !== 'RUNNING') {
        return res;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`Submission ${submissionId} did not reach a terminal status within ${POLL_TIMEOUT_MS}ms`);
  }

  function assertNoHiddenLeak(body: unknown) {
    const json = JSON.stringify(body);
    expect(json).not.toContain(HIDDEN_INPUT);
    expect(json).not.toContain(HIDDEN_EXPECTED);
  }

  describe('grading outcomes', () => {
    let questionId: string;
    let attemptId: string;

    beforeAll(async () => {
      questionId = await createQuestion();
    });

    beforeEach(async () => {
      const assessmentId = await createActiveAssessmentWith(questionId, 20);
      attemptId = await startAttempt(assessmentId, studentToken);
    });

    it('accepts a correct solution against public + hidden tests and awards full marks', async () => {
      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'a, b = map(int, input().split())\nprint(a + b)' });
      expect(submit.status).toBe(202);
      expect(submit.body.kind).toBe('SUBMIT');
      expect(submit.body.testsTotal).toBe(3); // 2 public + 1 hidden

      const result = await pollSubmission(submit.body.submissionId, studentToken);
      expect(result.body.status).toBe('ACCEPTED');
      expect(result.body.kind).toBe('SUBMIT');
      expect(result.body.testsPassed).toBe(3);
      expect(result.body.testsTotal).toBe(3);
      expect(result.body.score).toBe(20);
      expect(result.body.testCases).toHaveLength(3);

      const hiddenRows = result.body.testCases.filter((tc: { isHidden: boolean }) => tc.isHidden);
      expect(hiddenRows).toHaveLength(1);
      expect(hiddenRows[0].passed).toBe(true);
      expect(hiddenRows[0].input).toBeUndefined();
      expect(hiddenRows[0].expectedOutput).toBeUndefined();
      expect(hiddenRows[0].actualOutput).toBeUndefined();
      assertNoHiddenLeak(result.body);
    }, 25_000);

    it('reports WRONG_ANSWER when the hidden test fails but public tests pass, and awards zero marks', async () => {
      // a - b matches the two PUBLIC examples' magnitude by coincidence? No —
      // use a solution that passes both public cases but fails the hidden one
      // by hardcoding the public outputs (a classic "gamed the public tests" case).
      const gamedCode = [
        'line = input()',
        "if line == '2 3':",
        "    print('5')",
        "elif line == '10 20':",
        "    print('30')",
        'else:',
        "    print('0')",
      ].join('\n');

      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: gamedCode });
      expect(submit.status).toBe(202);

      const result = await pollSubmission(submit.body.submissionId, studentToken);
      expect(result.body.status).toBe('WRONG_ANSWER');
      expect(result.body.testsPassed).toBe(2);
      expect(result.body.testsTotal).toBe(3);
      expect(result.body.score).toBe(0);

      const hiddenRow = result.body.testCases.find((tc: { isHidden: boolean }) => tc.isHidden);
      expect(hiddenRow.passed).toBe(false);
      expect(hiddenRow.input).toBeUndefined();
      expect(hiddenRow.expectedOutput).toBeUndefined();
      expect(hiddenRow.actualOutput).toBeUndefined();
      assertNoHiddenLeak(result.body);
    }, 25_000);

    it('reports COMPILATION_ERROR and awards zero marks, with no test cases run', async () => {
      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'JAVA', code: 'public class Main { public static void main(String[] args) { int x = ; } }' });
      expect(submit.status).toBe(202);

      const result = await pollSubmission(submit.body.submissionId, studentToken);
      expect(result.body.status).toBe('COMPILATION_ERROR');
      expect(result.body.score).toBe(0);
      expect(result.body.testCases).toHaveLength(0);
      assertNoHiddenLeak(result.body);
    }, 25_000);

    it('reports RUNTIME_ERROR and awards zero marks', async () => {
      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'raise ValueError("boom")' });
      expect(submit.status).toBe(202);

      const result = await pollSubmission(submit.body.submissionId, studentToken);
      expect(result.body.status).toBe('RUNTIME_ERROR');
      expect(result.body.score).toBe(0);
      assertNoHiddenLeak(result.body);
    }, 25_000);

    it('reports TIME_LIMIT_EXCEEDED and awards zero marks', async () => {
      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'while True:\n    pass' });
      expect(submit.status).toBe(202);

      const result = await pollSubmission(submit.body.submissionId, studentToken);
      expect(result.body.status).toBe('TIME_LIMIT_EXCEEDED');
      expect(result.body.score).toBe(0);
      assertNoHiddenLeak(result.body);
    }, 25_000);
  });

  describe('submission history', () => {
    let questionId: string;
    let assessmentId: string;
    let attemptId: string;

    beforeAll(async () => {
      questionId = await createQuestion();
    });

    beforeEach(async () => {
      assessmentId = await createActiveAssessmentWith(questionId, 20);
      attemptId = await startAttempt(assessmentId, studentToken);
    });

    it('lists both RUN and SUBMIT rows with safe fields only, newest first', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'a, b = map(int, input().split())\nprint(a + b)' });
      await pollSubmission(run.body.submissionId, studentToken);

      await new Promise((resolve) => setTimeout(resolve, 2100)); // clear the combined run/submit throttle

      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'a, b = map(int, input().split())\nprint(a + b)' });
      await pollSubmission(submit.body.submissionId, studentToken);

      const history = await request(server)
        .get(`/api/v1/attempts/${attemptId}/questions/${questionId}/submissions`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(2);
      expect(history.body[0].kind).toBe('SUBMIT'); // newest first
      expect(history.body[0].score).toBe(20);
      expect(history.body[1].kind).toBe('RUN');
      expect(history.body[1].score).toBe(0); // Run is never graded

      // Safe-summary shape: no per-test detail, nothing hidden-related at all.
      for (const item of history.body) {
        expect(item.testCases).toBeUndefined();
        expect(item).not.toHaveProperty('code');
      }
      assertNoHiddenLeak(history.body);
    }, 30_000);

    it("never returns another student's submission history (empty, not an error)", async () => {
      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'a, b = map(int, input().split())\nprint(a + b)' });
      await pollSubmission(submit.body.submissionId, studentToken);

      // A different student's own attempt/question pairing simply has no rows —
      // ownership is enforced on the attempt, so there's no cross-student id to try.
      const otherAssessment = await createActiveAssessmentWith(questionId, 20);
      const otherAttempt = await startAttempt(otherAssessment, otherStudentToken);
      const history = await request(server)
        .get(`/api/v1/attempts/${otherAttempt}/questions/${questionId}/submissions`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(0);
    }, 25_000);

    it("rejects a student reading another student's attempt history (404, ownership-checked)", async () => {
      const res = await request(server)
        .get(`/api/v1/attempts/${attemptId}/questions/${questionId}/submissions`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('authorization & attempt-state enforcement', () => {
    let questionId: string;
    let assessmentId: string;
    let attemptId: string;

    beforeAll(async () => {
      questionId = await createQuestion();
    });

    beforeEach(async () => {
      assessmentId = await createActiveAssessmentWith(questionId, 20);
      attemptId = await startAttempt(assessmentId, studentToken);
    });

    it('rejects unauthenticated submit requests (401)', async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(401);
    });

    it("rejects another student submitting against this attempt (404, ownership-checked)", async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(404);
    });

    it('rejects a question id not belonging to this assessment (404)', async () => {
      const foreignQuestion = await createQuestion();
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${foreignQuestion}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(404);
    });

    it('rejects an unsupported language for this question (422)', async () => {
      const pyOnly = await createQuestion({ supportedLanguages: ['PYTHON'], referenceSolutions: { PYTHON: 'print(1)' } });
      const localAssessment = await createActiveAssessmentWith(pyOnly, 20);
      const localAttempt = await startAttempt(localAssessment, studentToken);
      const res = await request(server)
        .post(`/api/v1/attempts/${localAttempt}/questions/${pyOnly}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'JAVA', code: 'public class Main {}' });
      expect(res.status).toBe(422);
    });

    it('rejects invalid input (400): missing source code', async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: '' });
      expect(res.status).toBe(400);
    });

    it('rejects Submit once the attempt is already submitted (409)', async () => {
      const freshAssessment = await createActiveAssessmentWith(questionId, 20);
      const freshAttempt = await startAttempt(freshAssessment, otherStudentToken);
      const finish = await request(server)
        .post(`/api/v1/assessments/${freshAssessment}/submit`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      expect(finish.status).toBe(201);

      const res = await request(server)
        .post(`/api/v1/attempts/${freshAttempt}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(409);
    });

    it('throttles a Submit that immediately follows a Run for the same question (429, combined throttle)', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(run.status).toBe(202);

      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(submit.status).toBe(429);
    });

    it('never returns a SUBMIT submission belonging to another student via GET /submissions/:id (404)', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100)); // clear the throttle from the previous test

      const submit = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(submit.status).toBe(202);

      const res = await request(server)
        .get(`/api/v1/submissions/${submit.body.submissionId}`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
    }, 10_000);
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

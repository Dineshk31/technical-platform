import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { waitForVerification } from './verification-helpers.js';

/**
 * Phase 18 — the reference-solution verification gate, end to end through the real
 * execution service (isolated e2e instance on :4199, see e2e-global-setup.ts).
 */
const PASSWORD = 'TestPass123!';
const runId = Date.now();
const HIDDEN_INPUT = '84271 19348';
const HIDDEN_EXPECTED = '103619';
const CORRECT = 'a, b = map(int, input().split())\nprint(a + b)';
const WRONG = 'a, b = map(int, input().split())\nprint(a - b)';

describe('Reference-solution verification gate (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let adminToken: string;
  let studentToken: string;
  let studentId: string;
  const userIds: string[] = [];
  const questionIds: string[] = [];

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
      data: { email: `verify-e2e-admin-${runId}@test.local`, passwordHash, name: 'Verify Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `verify-e2e-student-${runId}@test.local`, passwordHash, name: 'Verify Student', roleId: studentRole.id },
    });
    studentId = student.id;
    userIds.push(admin.id, student.id);
    adminToken = (await request(server).post('/api/v1/auth/login').send({ email: admin.email, password: PASSWORD })).body.accessToken;
    studentToken = (await request(server).post('/api/v1/auth/login').send({ email: student.email, password: PASSWORD })).body.accessToken;
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { OR: [{ questionId: { in: questionIds } }, { userId: { in: userIds } }] } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function createQuestion(referenceSolution: string) {
    const res = await request(server)
      .post('/api/v1/questions/coding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Verify Sum ${runId}-${Math.random().toString(36).slice(2)}`,
        problemStatement: 'Read two integers a and b and print a + b.',
        inputFormat: 'Two space-separated integers.',
        outputFormat: 'A single integer.',
        constraints: [],
        examples: [{ input: '2 3', output: '5' }],
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 10,
        timeLimitSeconds: 2,
        memoryLimitMb: 256,
        supportedLanguages: ['PYTHON'],
        publicTestCases: [{ input: '2 3', expectedOutput: '5' }],
        hiddenTestCases: [{ input: HIDDEN_INPUT, expectedOutput: HIDDEN_EXPECTED }],
        referenceSolutions: { PYTHON: referenceSolution },
        starterTemplates: {},
      });
    expect(res.status).toBe(201);
    questionIds.push(res.body.id);
    return res.body.id as string;
  }

  const approve = (id: string) =>
    request(server).post(`/api/v1/questions/${id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });
  const detail = (id: string) => request(server).get(`/api/v1/questions/${id}`).set('Authorization', `Bearer ${adminToken}`);

  it('verifies a correct reference solution against ALL tests, public and hidden, then allows approval', async () => {
    const id = await createQuestion(CORRECT);
    const verification = await waitForVerification(server, adminToken, id);
    expect(verification.status).toBe('PASSED');
    expect(verification.solutions).toEqual([
      expect.objectContaining({ language: 'PYTHON', status: 'PASSED', verdict: 'ACCEPTED', testsPassed: 2, testsTotal: 2, failures: [] }),
    ]);

    const res = await approve(id);
    expect(res.status).toBe(201);
    expect(res.body.approvalStatus).toBe('APPROVED');
    const list = await request(server).get(`/api/v1/questions?search=${encodeURIComponent(res.body.title)}`).set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data[0].verificationStatus).toBe('PASSED');
  }, 40_000);

  it('fails a broken reference solution, shows the failing hidden test to the admin, and blocks approval', async () => {
    const id = await createQuestion(WRONG);
    const verification = await waitForVerification(server, adminToken, id);
    expect(verification.status).toBe('FAILED');
    const hiddenFailure = verification.solutions[0].failures.find((f) => f.isHidden);
    expect(hiddenFailure).toMatchObject({ status: 'WRONG_ANSWER', input: HIDDEN_INPUT, expectedOutput: HIDDEN_EXPECTED, actualOutput: expect.stringContaining('64923') });

    const res = await approve(id);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('failed verification');
    expect((await detail(id)).body.approvalStatus).toBe('PENDING_REVIEW');
  }, 40_000);

  it('blocks approval while verification is still running or was never run', async () => {
    const id = await createQuestion(CORRECT);
    const whileRunning = await approve(id);
    // Either still judging (PENDING) or — on a very fast machine — already passed.
    if (whileRunning.status === 422) expect(JSON.stringify(whileRunning.body)).toContain('verification');
    await waitForVerification(server, adminToken, id);

    // Changing the reference code throws the old verification away. (A trailing-whitespace
    // tweak would not count — the schema trims code — so this is a genuinely different solution.)
    await request(server)
      .patch(`/api/v1/questions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ referenceSolutions: { PYTHON: 'a, b = map(int, input().split())\nprint(b + a)' } });
    expect((await detail(id)).body.verification.status).toBe('UNVERIFIED');
    const unverified = await approve(id);
    expect(unverified.status).toBe(422);
    expect(JSON.stringify(unverified.body)).toContain('must be verified');
  }, 40_000);

  it('invalidates verification (and sends an approved question back to review) only when grading actually changes', async () => {
    const id = await createQuestion(CORRECT);
    await waitForVerification(server, adminToken, id);
    expect((await approve(id)).status).toBe(201);

    // Re-saving identical values (what the admin form does on every save) keeps everything.
    const same = await request(server)
      .patch(`/api/v1/questions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: `Renamed ${runId}-${Math.random().toString(36).slice(2)}`, timeLimitSeconds: 2, referenceSolutions: { PYTHON: CORRECT } });
    expect(same.status).toBe(200);
    expect(same.body.verification.status).toBe('PASSED');
    expect(same.body.approvalStatus).toBe('APPROVED');

    // Adding a test changes what is being verified.
    const added = await request(server)
      .post(`/api/v1/questions/${id}/test-cases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isHidden: true, input: '1 1', expectedOutput: '2' });
    expect(added.status).toBe(201);
    expect(added.body.verification.status).toBe('UNVERIFIED');
    expect(added.body.approvalStatus).toBe('PENDING_REVIEW');

    // Re-verify, then editing a test's expected output invalidates again.
    const rerun = await request(server).post(`/api/v1/questions/${id}/verify`).set('Authorization', `Bearer ${adminToken}`);
    expect(rerun.status).toBe(201);
    expect((await waitForVerification(server, adminToken, id)).status).toBe('PASSED');
    const hidden = (await detail(id)).body.hiddenTestCases[0];
    const edited = await request(server)
      .patch(`/api/v1/questions/${id}/test-cases/${hidden.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expectedOutput: '999999' });
    expect(edited.body.verification.status).toBe('UNVERIFIED');

    // ...and a now-wrong test is caught by the next verification.
    await new Promise((r) => setTimeout(r, 10_100)); // per-question rate limit
    await request(server).post(`/api/v1/questions/${id}/verify`).set('Authorization', `Bearer ${adminToken}`);
    expect((await waitForVerification(server, adminToken, id)).status).toBe('FAILED');
  }, 90_000);

  it('rate-limits repeat verification of the same question and refuses to start a second run mid-flight', async () => {
    const id = await createQuestion(CORRECT);
    const inFlight = await request(server).post(`/api/v1/questions/${id}/verify`).set('Authorization', `Bearer ${adminToken}`);
    // The auto-run from creation is either still going (409) or just finished (429).
    expect([409, 429]).toContain(inFlight.status);
    await waitForVerification(server, adminToken, id);
    const tooSoon = await request(server).post(`/api/v1/questions/${id}/verify`).set('Authorization', `Bearer ${adminToken}`);
    expect(tooSoon.status).toBe(429);
  }, 40_000);

  it('keeps verification runs out of every student-facing path', async () => {
    const id = await createQuestion(CORRECT);
    await waitForVerification(server, adminToken, id);
    const verifyRun = await prisma.submission.findFirstOrThrow({ where: { questionId: id, kind: 'VERIFY' } });
    expect(verifyRun.userId).toBeNull();
    expect(verifyRun.attemptId).toBeNull();

    // A student who learns the id still can't read it.
    const asStudent = await request(server).get(`/api/v1/submissions/${verifyRun.id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(asStudent.status).toBe(404);

    // Approve it so it becomes a practice problem, then confirm the student's practice
    // state knows nothing about the verification run.
    expect((await approve(id)).status).toBe(201);
    const practice = await request(server).get(`/api/v1/practice/questions/${id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(practice.status).toBe(200);
    expect(practice.body.status).toBe('NOT_ATTEMPTED');
    const history = await request(server).get(`/api/v1/practice/questions/${id}/submissions`).set('Authorization', `Bearer ${studentToken}`);
    expect(history.body.data).toEqual([]);
    const progress = await request(server).get('/api/v1/practice/progress').set('Authorization', `Bearer ${studentToken}`);
    expect(progress.body.recentActivity.some((a: { questionId: string }) => a.questionId === id)).toBe(false);
    expect(await prisma.submission.count({ where: { userId: studentId } })).toBe(0);
  }, 40_000);

  it('is admin-only: 403 for a student, 401 unauthenticated', async () => {
    const id = questionIds[0];
    const asStudent = await request(server).post(`/api/v1/questions/${id}/verify`).set('Authorization', `Bearer ${studentToken}`);
    const anonymous = await request(server).post(`/api/v1/questions/${id}/verify`);
    expect(asStudent.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });
});

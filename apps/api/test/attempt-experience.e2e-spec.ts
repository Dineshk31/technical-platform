import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'TestPass123!';
const runId = Date.now();

describe('Student attempt experience (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  let adminToken: string;
  let studentToken: string;
  let otherStudentToken: string;
  let studentId: string;
  let otherStudentId: string;
  let adminId: string;
  let questionId: string;

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
      data: { email: `attempt-e2e-admin-${runId}@test.local`, passwordHash, name: 'Attempt E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `attempt-e2e-student-${runId}@test.local`, passwordHash, name: 'Attempt E2E Student', roleId: studentRole.id },
    });
    const other = await prisma.user.create({
      data: { email: `attempt-e2e-other-${runId}@test.local`, passwordHash, name: 'Attempt E2E Other', roleId: studentRole.id },
    });
    adminId = admin.id;
    studentId = student.id;
    otherStudentId = other.id;
    userIds.push(adminId, studentId, otherStudentId);

    const question = await prisma.question.create({
      data: {
        type: 'CODING',
        title: `Attempt E2E Question ${runId}`,
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 10,
        approvalStatus: 'APPROVED',
        createdById: admin.id,
        codingQuestion: {
          create: {
            problemStatement: 'p',
            inputFormat: 'i',
            outputFormat: 'o',
            constraints: [],
            examples: [{ input: '1', output: '1' }],
            languages: { create: [{ language: 'PYTHON' }] },
            testCases: {
              create: [
                { isHidden: false, input: 'pub-in', expectedOutput: 'pub-out', orderIndex: 0 },
                { isHidden: true, input: 'SECRET-in', expectedOutput: 'SECRET-out', orderIndex: 0 },
              ],
            },
          },
        },
      },
    });
    questionId = question.id;
    questionIds.push(questionId);

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

  async function createActiveAssessment(title: string, endInMs: number) {
    const now = Date.now();
    const create = await request(server)
      .post('/api/v1/assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        durationMinutes: 60,
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + endInMs).toISOString(),
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
      .send({ questionId });
    await request(server)
      .post(`/api/v1/assessments/${assessmentId}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [studentId] });
    await request(server).post(`/api/v1/assessments/${assessmentId}/publish`).set('Authorization', `Bearer ${adminToken}`);
    return assessmentId;
  }

  describe('happy path: start, status, questions, submit', () => {
    let assessmentId: string;
    let attemptId: string;

    beforeAll(async () => {
      assessmentId = await createActiveAssessment(`Attempt Flow ${runId}`, 30 * 60_000);
    });

    it('rejects unauthenticated access to the new endpoints (401)', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/status`);
      expect(res.status).toBe(401);
    });

    it('404s status/questions before the attempt exists', async () => {
      const status = await request(server).get(`/api/v1/assessments/${assessmentId}/status`).set('Authorization', `Bearer ${studentToken}`);
      expect(status.status).toBe(404);
      const questions = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(questions.status).toBe(404);
    });

    it('starts the attempt (creates exactly one row)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentId}/start`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(201);
      attemptId = res.body.id;

      const count = await prisma.attempt.count({ where: { assessmentId, userId: studentId } });
      expect(count).toBe(1);
    });

    it('resuming (calling start again) does not create a second attempt', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentId}/start`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.id).toBe(attemptId);
      const count = await prisma.attempt.count({ where: { assessmentId, userId: studentId } });
      expect(count).toBe(1);
    });

    it('reports server-authoritative status', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/status`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ attemptId, status: 'IN_PROGRESS', startedAt: expect.any(String), endsAt: expect.any(String), serverNow: expect.any(String) }),
      );
    });

    it('returns student-safe questions with public test cases only — no hidden data, no ref solutions', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      const q = res.body.sections[0].questions[0];
      expect(q.status).toBe('NOT_ATTEMPTED');
      expect(q.publicTestCases).toEqual([expect.objectContaining({ input: 'pub-in', expectedOutput: 'pub-out' })]);
      expect(q.hiddenTestCases).toBeUndefined();
      expect(q.referenceSolutions).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('SECRET');
    });

    it('resolves the attempt-centric route by attempt id', async () => {
      const res = await request(server).get(`/api/v1/attempts/${attemptId}`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({ id: attemptId, assessmentId, status: 'IN_PROGRESS' }));
    });

    it('rejects another student reading this attempt by id (404, ownership-checked)', async () => {
      const res = await request(server).get(`/api/v1/attempts/${attemptId}`).set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
    });

    it('rejects a non-participant reading status/questions for this assessment (404)', async () => {
      const status = await request(server).get(`/api/v1/assessments/${assessmentId}/status`).set('Authorization', `Bearer ${otherStudentToken}`);
      expect(status.status).toBe(404);
    });

    it('finishes the attempt early via submit', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SUBMITTED');
    });

    it('reflects SUBMITTED in status afterward', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/status`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.status).toBe('SUBMITTED');
    });

    it('rejects submitting a second time (409)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(409);
    });

    it('still allows read-only viewing of questions after submission', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('expiration', () => {
    it('auto-transitions an expired IN_PROGRESS attempt to AUTO_SUBMITTED on the next read', async () => {
      const assessmentId = await createActiveAssessment(`Attempt Expiry ${runId}`, 900);
      const start = await request(server).post(`/api/v1/assessments/${assessmentId}/start`).set('Authorization', `Bearer ${studentToken}`);
      expect(start.body.status).toBe('IN_PROGRESS');

      await new Promise((r) => setTimeout(r, 1300));

      const status = await request(server).get(`/api/v1/assessments/${assessmentId}/status`).set('Authorization', `Bearer ${studentToken}`);
      expect(status.body.status).toBe('AUTO_SUBMITTED');

      const stored = await prisma.attempt.findUnique({ where: { id: start.body.id } });
      expect(stored?.status).toBe('AUTO_SUBMITTED');
      expect(stored?.submittedAt).not.toBeNull();

      // read-only access still works after expiry
      const questions = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(questions.status).toBe(200);

      // and submit is correctly rejected since it's no longer IN_PROGRESS
      const submit = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(submit.status).toBe(409);
    });
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

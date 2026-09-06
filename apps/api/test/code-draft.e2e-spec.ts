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

describe('Code drafts & starter templates (e2e)', () => {
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
      data: { email: `draft-e2e-admin-${runId}@test.local`, passwordHash, name: 'Draft E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `draft-e2e-student-${runId}@test.local`, passwordHash, name: 'Draft E2E Student', roleId: studentRole.id },
    });
    const other = await prisma.user.create({
      data: { email: `draft-e2e-other-${runId}@test.local`, passwordHash, name: 'Draft E2E Other', roleId: studentRole.id },
    });
    adminId = admin.id;
    studentId = student.id;
    otherStudentId = other.id;
    userIds.push(adminId, studentId, otherStudentId);

    adminToken = await login(server, admin.email);
    studentToken = await login(server, student.email);
    otherStudentToken = await login(server, other.email);
  });

  afterAll(async () => {
    // AttemptCodeDraft cascades on Attempt delete — no separate cleanup needed.
    await prisma.attempt.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessmentParticipant.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessmentQuestion.deleteMany({ where: { section: { assessmentId: { in: assessmentIds } } } });
    await prisma.assessmentSection.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('creates a question with a question-specific starter template and returns it', async () => {
    const res = await request(server)
      .post('/api/v1/questions/coding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Draft E2E Question ${runId}`,
        problemStatement: 'p',
        inputFormat: 'i',
        outputFormat: 'o',
        constraints: [],
        examples: [{ input: '1', output: '1' }],
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 10,
        timeLimitSeconds: 2,
        memoryLimitMb: 256,
        supportedLanguages: ['CPP', 'PYTHON'],
        publicTestCases: [{ input: '1', expectedOutput: '1' }],
        hiddenTestCases: [{ input: '2', expectedOutput: '2' }],
        referenceSolutions: { PYTHON: 'print(1)' },
        starterTemplates: { PYTHON: '# custom starter for this question' },
      });
    expect(res.status).toBe(201);
    expect(res.body.starterTemplates).toEqual([{ language: 'PYTHON', code: '# custom starter for this question' }]);
    questionId = res.body.id;
    questionIds.push(questionId);

    await request(server).post(`/api/v1/questions/${questionId}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });
  });

  async function createActiveAssessment(title: string) {
    const now = Date.now();
    const create = await request(server)
      .post('/api/v1/assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title, durationMinutes: 60, startAt: new Date(now - 60_000).toISOString(), endAt: new Date(now + 30 * 60_000).toISOString() });
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

  describe('draft persistence', () => {
    let assessmentId: string;
    let attemptId: string;

    beforeAll(async () => {
      assessmentId = await createActiveAssessment(`Draft Flow ${runId}`);
      const start = await request(server).post(`/api/v1/assessments/${assessmentId}/start`).set('Authorization', `Bearer ${studentToken}`);
      attemptId = start.body.id;
    });

    it('returns starterCode (question-specific) via the student questions endpoint', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      const q = res.body.sections[0].questions[0];
      expect(q.starterCode).toEqual({ PYTHON: '# custom starter for this question' });
      expect(q.referenceSolutions).toBeUndefined();
    });

    it('starts with no drafts saved', async () => {
      const res = await request(server).get(`/api/v1/attempts/${attemptId}/drafts`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('saves a CPP draft and a separate PYTHON draft for the same question', async () => {
      const cpp = await request(server)
        .put(`/api/v1/attempts/${attemptId}/questions/${questionId}/draft`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'CPP', code: 'int main() { return 0; }' });
      expect(cpp.status).toBe(200);

      const py = await request(server)
        .put(`/api/v1/attempts/${attemptId}/questions/${questionId}/draft`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print("hi")' });
      expect(py.status).toBe(200);

      const list = await request(server).get(`/api/v1/attempts/${attemptId}/drafts`).set('Authorization', `Bearer ${studentToken}`);
      expect(list.body).toHaveLength(2);
      const byLang = Object.fromEntries(list.body.map((d: { language: string; code: string }) => [d.language, d.code]));
      expect(byLang.CPP).toBe('int main() { return 0; }');
      expect(byLang.PYTHON).toBe('print("hi")');
    });

    it('overwrites (upserts) the same language slot rather than duplicating', async () => {
      await request(server)
        .put(`/api/v1/attempts/${attemptId}/questions/${questionId}/draft`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'CPP', code: 'int main() { return 1; }' });

      const list = await request(server).get(`/api/v1/attempts/${attemptId}/drafts`).set('Authorization', `Bearer ${studentToken}`);
      const cppDrafts = list.body.filter((d: { language: string }) => d.language === 'CPP');
      expect(cppDrafts).toHaveLength(1);
      expect(cppDrafts[0].code).toBe('int main() { return 1; }');
      // PYTHON draft untouched by the CPP save
      const pyDraft = list.body.find((d: { language: string }) => d.language === 'PYTHON');
      expect(pyDraft.code).toBe('print("hi")');
    });

    it('rejects saving a draft for a question not in this assessment (404)', async () => {
      const foreignQuestion = await prisma.question.findFirst({ where: { NOT: { id: questionId } }, select: { id: true } });
      if (!foreignQuestion) return; // defensive — should always find the seed "Two Sum"
      const res = await request(server)
        .put(`/api/v1/attempts/${attemptId}/questions/${foreignQuestion.id}/draft`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'CPP', code: 'x' });
      expect(res.status).toBe(404);
    });

    it('rejects unauthenticated access (401)', async () => {
      const res = await request(server).get(`/api/v1/attempts/${attemptId}/drafts`);
      expect(res.status).toBe(401);
    });

    it('rejects another student reading this attempt\'s drafts (404, ownership-checked)', async () => {
      const res = await request(server).get(`/api/v1/attempts/${attemptId}/drafts`).set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
    });

    it('rejects another student saving into this attempt (404)', async () => {
      const res = await request(server)
        .put(`/api/v1/attempts/${attemptId}/questions/${questionId}/draft`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({ language: 'CPP', code: 'malicious' });
      expect(res.status).toBe(404);

      // and the real owner's draft is unchanged
      const list = await request(server).get(`/api/v1/attempts/${attemptId}/drafts`).set('Authorization', `Bearer ${studentToken}`);
      const cppDraft = list.body.find((d: { language: string }) => d.language === 'CPP');
      expect(cppDraft.code).toBe('int main() { return 1; }');
    });

    it('rejects invalid input (400): bad language enum', async () => {
      const res = await request(server)
        .put(`/api/v1/attempts/${attemptId}/questions/${questionId}/draft`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'RUBY', code: 'x' });
      expect(res.status).toBe(400);
    });

    it('blocks saving once the attempt is submitted (409), but reading remains allowed', async () => {
      const submit = await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(submit.status).toBe(201);

      const save = await request(server)
        .put(`/api/v1/attempts/${attemptId}/questions/${questionId}/draft`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'CPP', code: 'too late' });
      expect(save.status).toBe(409);

      const read = await request(server).get(`/api/v1/attempts/${attemptId}/drafts`).set('Authorization', `Bearer ${studentToken}`);
      expect(read.status).toBe(200);
      expect(read.body.find((d: { language: string }) => d.language === 'CPP').code).toBe('int main() { return 1; }');
    });
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

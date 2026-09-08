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

describe('Assessments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  let adminToken: string;
  let studentToken: string;
  let otherStudentToken: string;
  let adminId: string;
  let studentId: string;
  let otherStudentId: string;
  let questionId: string;
  let pendingQuestionId: string;
  let mcqQuestionId: string;

  const assessmentIds: string[] = [];
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
      data: { email: `e2e-admin-${runId}@test.local`, passwordHash, name: 'E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: {
        email: `e2e-student-${runId}@test.local`,
        passwordHash,
        name: 'E2E Student',
        roleId: studentRole.id,
        department: 'CSE',
        batch: `B${runId}`,
      },
    });
    const otherStudent = await prisma.user.create({
      data: { email: `e2e-other-${runId}@test.local`, passwordHash, name: 'E2E Other Student', roleId: studentRole.id },
    });
    adminId = admin.id;
    studentId = student.id;
    otherStudentId = otherStudent.id;
    userIds.push(adminId, studentId, otherStudentId);

    const question = await prisma.question.create({
      data: {
        type: 'CODING',
        title: `E2E Question ${runId}`,
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
            examples: [],
            testCases: {
              create: [
                { isHidden: false, input: '1', expectedOutput: '1', orderIndex: 0 },
                { isHidden: true, input: '2', expectedOutput: '2', orderIndex: 1 },
              ],
            },
          },
        },
      },
    });
    questionId = question.id;
    questionIds.push(questionId);

    const pending = await prisma.question.create({
      data: {
        type: 'CODING',
        title: `E2E Pending Question ${runId}`,
        difficulty: 'EASY',
        marks: 5,
        approvalStatus: 'PENDING_REVIEW',
        createdById: admin.id,
        codingQuestion: {
          create: { problemStatement: 'p', inputFormat: 'i', outputFormat: 'o', constraints: [], examples: [] },
        },
      },
    });
    pendingQuestionId = pending.id;
    questionIds.push(pendingQuestionId);

    const mcq = await prisma.question.create({
      data: {
        type: 'MCQ',
        title: `E2E MCQ Question ${runId}`,
        difficulty: 'EASY',
        marks: 5,
        approvalStatus: 'APPROVED',
        createdById: admin.id,
        mcqQuestion: { create: { mcqType: 'SINGLE_CHOICE', questionText: 'q?' } },
      },
    });
    mcqQuestionId = mcq.id;
    questionIds.push(mcqQuestionId);

    adminToken = await login(server, admin.email);
    studentToken = await login(server, student.email);
    otherStudentToken = await login(server, otherStudent.email);
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

  // ============================================================
  // Authentication / authorization boundaries
  // ============================================================

  describe('authentication & authorization', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(server).get('/api/v1/assessments');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a STUDENT calling admin-only assessment endpoints with 403', async () => {
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(validCreatePayload('Should be forbidden'));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects an ADMIN calling the student-only "assigned" endpoint with 403', async () => {
      const res = await request(server).get('/api/v1/assessments/assigned').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // Admin: create, validation
  // ============================================================

  describe('admin: create', () => {
    it('creates a DRAFT assessment', async () => {
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('E2E Assessment A'));
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.maxMarks).toBe(0);
      assessmentIds.push(res.body.id);
    });

    it('rejects endAt <= startAt with a 400 validation error', async () => {
      const now = new Date();
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Bad window',
          durationMinutes: 30,
          startAt: now.toISOString(),
          endAt: now.toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'endAt')).toBe(true);
    });

    it('rejects a missing title with a 400 validation error', async () => {
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ durationMinutes: 30, startAt: new Date().toISOString(), endAt: new Date(Date.now() + 60000).toISOString() });
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // Admin: full lifecycle on "Assessment A" (future window)
  // ============================================================

  describe('admin: assessment A lifecycle', () => {
    let assessmentA: string;
    let sectionId: string;
    let aqId: string;

    beforeAll(async () => {
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('E2E Assessment A Lifecycle', 1, 2));
      assessmentA = res.body.id;
      assessmentIds.push(assessmentA);
    });

    it('lists the created assessment (admin list, pagination shape)', async () => {
      const res = await request(server)
        .get('/api/v1/assessments?page=1&pageSize=50')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual(
        expect.objectContaining({ page: 1, pageSize: 50, total: expect.any(Number), totalPages: expect.any(Number) }),
      );
      expect(res.body.data.some((a: { id: string }) => a.id === assessmentA)).toBe(true);
    });

    it('filters the list by status and by search', async () => {
      const byStatus = await request(server)
        .get('/api/v1/assessments?status=DRAFT')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(byStatus.status).toBe(200);
      expect(byStatus.body.data.every((a: { status: string }) => a.status === 'DRAFT')).toBe(true);

      const bySearch = await request(server)
        .get('/api/v1/assessments?search=Lifecycle')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(bySearch.status).toBe(200);
      expect(bySearch.body.data.some((a: { id: string }) => a.id === assessmentA)).toBe(true);
    });

    it('returns 404 for a non-existent assessment id', async () => {
      const res = await request(server)
        .get('/api/v1/assessments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('gets the full admin detail', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentA}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ id: assessmentA, sections: [], participants: [], createdBy: expect.any(Object) }),
      );
    });

    it('updates metadata while DRAFT', async () => {
      const res = await request(server)
        .patch(`/api/v1/assessments/${assessmentA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Updated description' });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Updated description');
    });

    it('adds a section', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Section 1', sectionType: 'CODING' });
      expect(res.status).toBe(201);
      expect(res.body.sections).toHaveLength(1);
      sectionId = res.body.sections[0].id;
    });

    // MCQ sections are valid as of Phase 11 (see test/mcq.e2e-spec.ts for full MCQ
    // section/attachment coverage, using its own assessment fixture) — this block keeps
    // `assessmentA` CODING-only throughout so the publish/lock lifecycle tests below stay
    // about exactly one section, and instead checks that a genuinely-invalid sectionType
    // is still rejected.
    it('rejects an invalid sectionType (400)', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Section X', sectionType: 'ESSAY' });
      expect(res.status).toBe(400);
    });

    it('rejects publishing before any question/participant is attached (422 with details)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentA}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('rejects attaching a PENDING_REVIEW question (422)', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: pendingQuestionId });
      expect(res.status).toBe(422);
    });

    it('rejects attaching an MCQ question in Phase 2 (422)', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: mcqQuestionId });
      expect(res.status).toBe(422);
    });

    it('rejects attaching a non-existent question (404)', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    it('attaches the approved question and recomputes maxMarks', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId });
      expect(res.status).toBe(201);
      expect(res.body.maxMarks).toBe(10);
      aqId = res.body.sections[0].questions[0].id;
    });

    it('rejects attaching the same question twice (409)', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('overrides marks and recomputes maxMarks', async () => {
      const res = await request(server)
        .patch(`/api/v1/assessments/${assessmentA}/sections/${sectionId}/questions/${aqId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ marksOverride: 25 });
      expect(res.status).toBe(200);
      expect(res.body.maxMarks).toBe(25);
    });

    it('still rejects publishing with no participants (422)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentA}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(422);
      expect(res.body.error.details.some((d: { issue: string }) => d.issue.includes('participant'))).toBe(true);
    });

    it('assigns the student directly', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [studentId] });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ added: 1, alreadyAssigned: 0, total: 1 });
    });

    it('is idempotent when assigning the same student again', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [studentId] });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ added: 0, alreadyAssigned: 1, total: 1 });
    });

    it('rejects assigning a non-student user id (422)', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentA}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [adminId] });
      expect(res.status).toBe(422);
    });

    it('publishes successfully once every requirement is met', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentA}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('rejects publishing an already-published assessment (409)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentA}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('locks structural fields once published (422 listing every locked field)', async () => {
      const res = await request(server)
        .patch(`/api/v1/assessments/${assessmentA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New title', durationMinutes: 120 });
      expect(res.status).toBe(422);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['title', 'durationMinutes']));
    });

    it('still allows editing description/instructions once published', async () => {
      const res = await request(server)
        .patch(`/api/v1/assessments/${assessmentA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ instructions: 'Read carefully' });
      expect(res.status).toBe(200);
      expect(res.body.instructions).toBe('Read carefully');
    });

    it('locks structural edits (sections/questions) once published (409)', async () => {
      const res = await request(server)
        .delete(`/api/v1/assessments/${assessmentA}/sections/${sectionId}/questions/${aqId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('rejects deleting a published assessment (409)', async () => {
      const res = await request(server).delete(`/api/v1/assessments/${assessmentA}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('unpublishes back to DRAFT (window has not started yet)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentA}/unpublish`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DRAFT');
    });

    it('rejects unpublishing a DRAFT assessment (409)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentA}/unpublish`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('allows structural edits again once back in DRAFT', async () => {
      const res = await request(server)
        .patch(`/api/v1/assessments/${assessmentA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'E2E Assessment A Lifecycle (renamed)' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('E2E Assessment A Lifecycle (renamed)');
    });

    it('rejects archiving a DRAFT assessment (409)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentA}/archive`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });
  });

  // ============================================================
  // Admin: publish validation aggregation on an empty draft
  // ============================================================

  describe('admin: publish validation on an empty/expired draft', () => {
    let assessmentC: string;

    beforeAll(async () => {
      const now = Date.now();
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Assessment C (empty, expired window)',
          durationMinutes: 30,
          startAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
          endAt: new Date(now - 60 * 60 * 1000).toISOString(),
        });
      assessmentC = res.body.id;
      assessmentIds.push(assessmentC);
    });

    it('reports every failing check at once', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentC}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(422);
      const issues = res.body.error.details.map((d: { issue: string }) => d.issue);
      expect(issues.some((i: string) => i.includes('section'))).toBe(true);
      expect(issues.some((i: string) => i.includes('participant'))).toBe(true);
      expect(issues.some((i: string) => i.includes('future'))).toBe(true);
    });

    it('can still be deleted while DRAFT', async () => {
      const res = await request(server).delete(`/api/v1/assessments/${assessmentC}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
      assessmentIds.splice(assessmentIds.indexOf(assessmentC), 1);
    });

    it('returns 404 for the now-deleted assessment', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentC}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // Student flow: an assessment whose window is active right now
  // ============================================================

  describe('student flow: active assessment', () => {
    let assessmentB: string;

    beforeAll(async () => {
      const now = Date.now();
      const create = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Assessment B (active now)',
          durationMinutes: 20,
          startAt: new Date(now - 60 * 1000).toISOString(),
          endAt: new Date(now + 30 * 60 * 1000).toISOString(),
        });
      assessmentB = create.body.id;
      assessmentIds.push(assessmentB);

      const section = await request(server)
        .post(`/api/v1/assessments/${assessmentB}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Section 1', sectionType: 'CODING' });
      await request(server)
        .post(`/api/v1/assessments/${assessmentB}/sections/${section.body.sections[0].id}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId });
      await request(server)
        .post(`/api/v1/assessments/${assessmentB}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [studentId] });
      await request(server).post(`/api/v1/assessments/${assessmentB}/publish`).set('Authorization', `Bearer ${adminToken}`);
    });

    it('shows up in the assigned student\'s list but not the unassigned student\'s list', async () => {
      const mine = await request(server).get('/api/v1/assessments/assigned').set('Authorization', `Bearer ${studentToken}`);
      expect(mine.status).toBe(200);
      expect(mine.body.data.some((a: { id: string }) => a.id === assessmentB)).toBe(true);
      expect(mine.body.data.find((a: { id: string }) => a.id === assessmentB).status).toBe('ACTIVE');

      const notMine = await request(server).get('/api/v1/assessments/assigned').set('Authorization', `Bearer ${otherStudentToken}`);
      expect(notMine.body.data.some((a: { id: string }) => a.id === assessmentB)).toBe(false);
    });

    it('returns a restricted detail view for the assigned student (no admin config data)', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentB}`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ id: assessmentB, title: expect.any(String), status: 'ACTIVE' }),
      );
      expect(res.body.sections).toBeUndefined();
      expect(res.body.participants).toBeUndefined();
      expect(res.body.createdBy).toBeUndefined();
    });

    it('returns 404 (not 403) for a student who is not a participant', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentB}`).set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
    });

    it('rejects an unassigned student starting the assessment (404)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentB}/start`).set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
    });

    it('lets the assigned student start the assessment and persists an attempt', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentB}/start`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({ assessmentId: assessmentB, status: 'IN_PROGRESS', id: expect.any(String) }),
      );

      const stored = await prisma.attempt.findUnique({ where: { assessmentId_userId: { assessmentId: assessmentB, userId: studentId } } });
      expect(stored).not.toBeNull();
      expect(stored?.id).toBe(res.body.id);
    });

    it('is idempotent — starting again resumes the same attempt', async () => {
      const first = await request(server).post(`/api/v1/assessments/${assessmentB}/start`).set('Authorization', `Bearer ${studentToken}`);
      const second = await request(server).post(`/api/v1/assessments/${assessmentB}/start`).set('Authorization', `Bearer ${studentToken}`);
      expect(first.body.id).toBe(second.body.id);
    });

    it('rejects unassigning a student who has already started (409)', async () => {
      const res = await request(server)
        .delete(`/api/v1/assessments/${assessmentB}/participants/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('rejects structural edits on a published+active assessment (409)', async () => {
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentB}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Too late', sectionType: 'CODING' });
      expect(res.status).toBe(409);
    });

    it('rejects archiving before the window completes (409)', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentB}/archive`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
    });
  });

  // ============================================================
  // Admin: archive once the window has genuinely elapsed
  // ============================================================

  describe('admin: archive after completion', () => {
    let assessmentD: string;

    beforeAll(async () => {
      const now = Date.now();
      const create = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Assessment D (short-lived)',
          durationMinutes: 5,
          startAt: new Date(now + 100).toISOString(),
          endAt: new Date(now + 700).toISOString(),
        });
      assessmentD = create.body.id;
      assessmentIds.push(assessmentD);

      const section = await request(server)
        .post(`/api/v1/assessments/${assessmentD}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Section 1', sectionType: 'CODING' });
      await request(server)
        .post(`/api/v1/assessments/${assessmentD}/sections/${section.body.sections[0].id}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId });
      await request(server)
        .post(`/api/v1/assessments/${assessmentD}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [studentId] });
      await request(server).post(`/api/v1/assessments/${assessmentD}/publish`).set('Authorization', `Bearer ${adminToken}`);
      // let the (very short) exam window elapse
      await new Promise((r) => setTimeout(r, 1200));
    });

    it('reports COMPLETED as the effective status once the window has passed', async () => {
      const res = await request(server).get(`/api/v1/assessments/${assessmentD}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.effectiveStatus).toBe('COMPLETED');
      expect(res.body.status).toBe('PUBLISHED'); // stored column unchanged — derived only
    });

    it('archives a completed assessment', async () => {
      const res = await request(server).post(`/api/v1/assessments/${assessmentD}/archive`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ARCHIVED');
    });

    it('no longer appears in the student assigned list once archived', async () => {
      const res = await request(server).get('/api/v1/assessments/assigned').set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.data.some((a: { id: string }) => a.id === assessmentD)).toBe(false);
    });
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

function validCreatePayload(title: string, startHoursFromNow = 1, endHoursFromNow = 3) {
  const now = Date.now();
  return {
    title,
    description: 'A sample assessment',
    durationMinutes: 60,
    startAt: new Date(now + startHoursFromNow * 60 * 60 * 1000).toISOString(),
    endAt: new Date(now + endHoursFromNow * 60 * 60 * 1000).toISOString(),
  };
}

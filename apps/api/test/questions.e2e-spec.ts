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

describe('Questions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  let adminToken: string;
  let studentToken: string;
  let adminId: string;
  let studentId: string;

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
      data: { email: `q-e2e-admin-${runId}@test.local`, passwordHash, name: 'Q E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `q-e2e-student-${runId}@test.local`, passwordHash, name: 'Q E2E Student', roleId: studentRole.id },
    });
    adminId = admin.id;
    studentId = student.id;
    userIds.push(adminId, studentId);

    adminToken = await login(server, admin.email);
    studentToken = await login(server, student.email);
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

  function validCreatePayload(title: string, overrides: Record<string, unknown> = {}) {
    return {
      title,
      problemStatement: 'Given an array, do the thing.',
      inputFormat: 'n and array',
      outputFormat: 'the answer',
      constraints: ['1 <= n <= 1000'],
      examples: [{ input: '1 2 3', output: '6', explanation: 'sum' }],
      difficulty: 'EASY',
      topics: ['Arrays'],
      tags: ['e2e'],
      marks: 10,
      timeLimitSeconds: 2,
      memoryLimitMb: 256,
      supportedLanguages: ['CPP', 'PYTHON'],
      publicTestCases: [{ input: '1 2 3', expectedOutput: '6' }],
      hiddenTestCases: [{ input: '4 5 6', expectedOutput: '15' }],
      referenceSolutions: { PYTHON: 'print(sum(map(int, input().split())))' },
      ...overrides,
    };
  }

  // ============================================================
  // Authentication / authorization
  // ============================================================

  describe('authentication & authorization', () => {
    it('rejects an unauthenticated request (401)', async () => {
      const res = await request(server).get('/api/v1/questions');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a STUDENT creating a question (403)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(validCreatePayload('Student attempt'));
      expect(res.status).toBe(403);
    });

    it('rejects a STUDENT listing questions (403)', async () => {
      const res = await request(server).get('/api/v1/questions').set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects a STUDENT reading a question, even a real id (403 — never leaks via a role check bypass)', async () => {
      const created = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Leak check ${runId}`));
      questionIds.push(created.body.id);

      const res = await request(server).get(`/api/v1/questions/${created.body.id}`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects a STUDENT editing (403)', async () => {
      const res = await request(server)
        .patch(`/api/v1/questions/${questionIds[0]}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'hacked' });
      expect(res.status).toBe(403);
    });

    it('rejects a STUDENT approving (403)', async () => {
      const res = await request(server)
        .post(`/api/v1/questions/${questionIds[0]}/review`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: 'APPROVED' });
      expect(res.status).toBe(403);
    });

    it('rejects a STUDENT deleting (403)', async () => {
      const res = await request(server).delete(`/api/v1/questions/${questionIds[0]}`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // Admin: create + validation
  // ============================================================

  describe('admin: create and validate', () => {
    it('creates a valid coding question as PENDING_REVIEW', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Two Sum Clone ${runId}`));
      expect(res.status).toBe(201);
      expect(res.body.approvalStatus).toBe('PENDING_REVIEW');
      expect(res.body.source).toBe('MANUAL');
      expect(res.body.publicTestCases).toHaveLength(1);
      expect(res.body.hiddenTestCases).toHaveLength(1);
      expect(res.body.referenceSolutions).toEqual([{ language: 'PYTHON', code: expect.any(String) }]);
      questionIds.push(res.body.id);
    });

    it('never returns hidden test case content mixed into publicTestCases', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validCreatePayload(`Mix check ${runId}`, {
            publicTestCases: [{ input: 'PUB_IN', expectedOutput: 'PUB_OUT' }],
            hiddenTestCases: [{ input: 'HID_IN', expectedOutput: 'HID_OUT' }],
          }),
        );
      questionIds.push(res.body.id);
      expect(res.body.publicTestCases.map((tc: { input: string }) => tc.input)).toEqual(['PUB_IN']);
      expect(res.body.hiddenTestCases.map((tc: { input: string }) => tc.input)).toEqual(['HID_IN']);
    });

    it('rejects a missing title (400)', async () => {
      const payload = validCreatePayload('x');
      delete (payload as Record<string, unknown>).title;
      const res = await request(server).post('/api/v1/questions/coding').set('Authorization', `Bearer ${adminToken}`).send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects zero examples (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('No examples', { examples: [] }));
      expect(res.status).toBe(400);
    });

    it('rejects zero public test cases (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('No public', { publicTestCases: [] }));
      expect(res.status).toBe(400);
    });

    it('rejects zero hidden test cases (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('No hidden', { hiddenTestCases: [] }));
      expect(res.status).toBe(400);
    });

    it('rejects zero reference solutions (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('No ref solution', { referenceSolutions: {} }));
      expect(res.status).toBe(400);
    });

    it('rejects a reference solution language not in supportedLanguages (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validCreatePayload('Mismatched ref language', {
            supportedLanguages: ['CPP'],
            referenceSolutions: { JAVA: 'class A {}' },
          }),
        );
      expect(res.status).toBe(400);
    });

    it('rejects an invalid difficulty (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('Bad difficulty', { difficulty: 'IMPOSSIBLE' }));
      expect(res.status).toBe(400);
    });

    it('rejects an empty topics array (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('No topics', { topics: [] }));
      expect(res.status).toBe(400);
    });

    it('rejects an unrecognized topic (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload('Bad topic', { topics: ['Not A Real Topic'] }));
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // Admin: list, search, filter, pagination
  // ============================================================

  describe('admin: list, search, filter', () => {
    it('lists questions with pagination meta', async () => {
      const res = await request(server).get('/api/v1/questions?pageSize=50').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual(expect.objectContaining({ page: 1, pageSize: 50 }));
      expect(res.body.data.some((q: { id: string }) => q.id === questionIds[0])).toBe(true);
    });

    it('searches by title', async () => {
      const res = await request(server)
        .get(`/api/v1/questions?search=${encodeURIComponent(`Two Sum Clone ${runId}`)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe(`Two Sum Clone ${runId}`);
    });

    it('filters by difficulty', async () => {
      const res = await request(server).get('/api/v1/questions?difficulty=EASY').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((q: { difficulty: string }) => q.difficulty === 'EASY')).toBe(true);
    });

    it('filters by topic', async () => {
      const res = await request(server).get('/api/v1/questions?topic=Arrays').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((q: { id: string }) => q.id === questionIds[0])).toBe(true);
    });

    it('filters by approvalStatus', async () => {
      const res = await request(server)
        .get('/api/v1/questions?approvalStatus=PENDING_REVIEW')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((q: { approvalStatus: string }) => q.approvalStatus === 'PENDING_REVIEW')).toBe(true);
    });

    it('paginates correctly with a small pageSize', async () => {
      const res = await request(server).get('/api/v1/questions?page=1&pageSize=1').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.pageSize).toBe(1);
    });
  });

  // ============================================================
  // Admin: update, test cases, approval workflow
  // ============================================================

  describe('admin: update, test cases, approval', () => {
    let questionId: string;
    let publicTcId: string;
    let hiddenTcId: string;

    beforeAll(async () => {
      const created = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Lifecycle Question ${runId}`));
      questionId = created.body.id;
      questionIds.push(questionId);
      publicTcId = created.body.publicTestCases[0].id;
      hiddenTcId = created.body.hiddenTestCases[0].id;
    });

    it('updates metadata', async () => {
      const res = await request(server)
        .patch(`/api/v1/questions/${questionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ marks: 20, difficulty: 'MEDIUM' });
      expect(res.status).toBe(200);
      expect(res.body.marks).toBe(20);
      expect(res.body.difficulty).toBe('MEDIUM');
    });

    it('adds an extra public and hidden test case', async () => {
      const pub = await request(server)
        .post(`/api/v1/questions/${questionId}/test-cases`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isHidden: false, input: 'extra-in', expectedOutput: 'extra-out' });
      expect(pub.status).toBe(201);
      expect(pub.body.publicTestCases).toHaveLength(2);

      const hid = await request(server)
        .post(`/api/v1/questions/${questionId}/test-cases`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isHidden: true, input: 'extra-hidden-in', expectedOutput: 'extra-hidden-out' });
      expect(hid.status).toBe(201);
      expect(hid.body.hiddenTestCases).toHaveLength(2);
    });

    it('updates a test case', async () => {
      const res = await request(server)
        .patch(`/api/v1/questions/${questionId}/test-cases/${publicTcId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expectedOutput: 'changed-output' });
      expect(res.status).toBe(200);
      const updated = res.body.publicTestCases.find((tc: { id: string }) => tc.id === publicTcId);
      expect(updated.expectedOutput).toBe('changed-output');
    });

    it('removes a test case', async () => {
      const res = await request(server)
        .delete(`/api/v1/questions/${questionId}/test-cases/${hiddenTcId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);

      const detail = await request(server).get(`/api/v1/questions/${questionId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(detail.body.hiddenTestCases.find((tc: { id: string }) => tc.id === hiddenTcId)).toBeUndefined();
    });

    it('rejects a non-existent test case id (404)', async () => {
      const res = await request(server)
        .patch(`/api/v1/questions/${questionId}/test-cases/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ input: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns a clean 400 (not a 500) for a malformed question id', async () => {
      const res = await request(server).get('/api/v1/questions/not-a-valid-uuid').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('approves the question, recording a review entry', async () => {
      const res = await request(server)
        .post(`/api/v1/questions/${questionId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED', notes: 'Looks good' });
      expect(res.status).toBe(201);
      expect(res.body.approvalStatus).toBe('APPROVED');
      expect(res.body.reviews[0]).toEqual(
        expect.objectContaining({ status: 'APPROVED', notes: 'Looks good', reviewedBy: expect.objectContaining({ id: adminId }) }),
      );
    });

    it('rejects (unapproves) the question back to PENDING_REVIEW', async () => {
      const res = await request(server)
        .post(`/api/v1/questions/${questionId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PENDING_REVIEW', notes: 'Needs another pass' });
      expect(res.status).toBe(201);
      expect(res.body.approvalStatus).toBe('PENDING_REVIEW');
      expect(res.body.reviews).toHaveLength(2);
    });

    it('rejects approval when the question has no hidden test cases (422)', async () => {
      const bare = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Bare Question ${runId}`));
      questionIds.push(bare.body.id);
      const hiddenId = bare.body.hiddenTestCases[0].id;

      await request(server)
        .delete(`/api/v1/questions/${bare.body.id}/test-cases/${hiddenId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(server)
        .post(`/api/v1/questions/${bare.body.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });
      expect(res.status).toBe(422);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'hiddenTestCases')).toBe(true);
    });

    it('rejects a review when the question was already reviewed by someone else since it was loaded (409)', async () => {
      const q = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Concurrent Review ${runId}`));
      questionIds.push(q.body.id);

      // Two "admins" both act on the same PENDING_REVIEW question at once — only one
      // write should land; the loser must get a conflict, not a silently clobbered decision.
      const [first, second] = await Promise.all([
        request(server).post(`/api/v1/questions/${q.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }),
        request(server).post(`/api/v1/questions/${q.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'REJECTED' }),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);

      const winner = first.status === 201 ? first : second;
      const detail = await request(server).get(`/api/v1/questions/${q.body.id}`).set('Authorization', `Bearer ${adminToken}`);
      expect(detail.body.approvalStatus).toBe(winner.body.approvalStatus);
      // Only the winning write's review entry was recorded — the loser never touched the DB.
      expect(detail.body.reviews).toHaveLength(1);
    });

    it('deletes an unreferenced question', async () => {
      const toDelete = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Disposable ${runId}`));
      const res = await request(server).delete(`/api/v1/questions/${toDelete.body.id}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);

      const getRes = await request(server).get(`/api/v1/questions/${toDelete.body.id}`).set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ============================================================
  // Assessment integration: question reuse, approval gating, lifecycle locks
  // ============================================================

  describe('assessment integration', () => {
    let approvedQuestionId: string;
    let pendingQuestionId: string;

    beforeAll(async () => {
      const approved = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Reusable Approved Question ${runId}`));
      approvedQuestionId = approved.body.id;
      questionIds.push(approvedQuestionId);
      await request(server)
        .post(`/api/v1/questions/${approvedQuestionId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      const pending = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Still Pending Question ${runId}`));
      pendingQuestionId = pending.body.id;
      questionIds.push(pendingQuestionId);
    });

    async function createDraftAssessment(title: string) {
      const now = Date.now();
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title,
          durationMinutes: 30,
          startAt: new Date(now + 60 * 60 * 1000).toISOString(),
          endAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        });
      assessmentIds.push(res.body.id);
      const section = await request(server)
        .post(`/api/v1/assessments/${res.body.id}/sections`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Section 1', sectionType: 'CODING' });
      return { assessmentId: res.body.id as string, sectionId: section.body.sections[0].id as string };
    }

    it('rejects attaching a PENDING_REVIEW question to an assessment (422)', async () => {
      const { assessmentId, sectionId } = await createDraftAssessment(`Q-Integration A ${runId}`);
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: pendingQuestionId });
      expect(res.status).toBe(422);
    });

    it('attaches an APPROVED question successfully', async () => {
      const { assessmentId, sectionId } = await createDraftAssessment(`Q-Integration B ${runId}`);
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: approvedQuestionId });
      expect(res.status).toBe(201);
    });

    it('prevents attaching the same question twice to the same section (409)', async () => {
      const { assessmentId, sectionId } = await createDraftAssessment(`Q-Integration C ${runId}`);
      await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: approvedQuestionId });
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: approvedQuestionId });
      expect(res.status).toBe(409);
    });

    it('reuses the same approved question across two different assessments', async () => {
      const a = await createDraftAssessment(`Q-Reuse A ${runId}`);
      const b = await createDraftAssessment(`Q-Reuse B ${runId}`);
      const attachA = await request(server)
        .post(`/api/v1/assessments/${a.assessmentId}/sections/${a.sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: approvedQuestionId });
      const attachB = await request(server)
        .post(`/api/v1/assessments/${b.assessmentId}/sections/${b.sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: approvedQuestionId });
      expect(attachA.status).toBe(201);
      expect(attachB.status).toBe(201);

      const detail = await request(server).get(`/api/v1/questions/${approvedQuestionId}`).set('Authorization', `Bearer ${adminToken}`);
      const attachedIds = detail.body.attachedToAssessments.map((x: { id: string }) => x.id);
      expect(attachedIds).toEqual(expect.arrayContaining([a.assessmentId, b.assessmentId]));
    });

    it('allows editing a question while every referencing assessment is DRAFT', async () => {
      const res = await request(server)
        .patch(`/api/v1/questions/${approvedQuestionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ marks: 42 });
      expect(res.status).toBe(200);
      expect(res.body.marks).toBe(42);
    });

    it('blocks editing and deleting once a referencing assessment is published, and blocks publish if the question becomes unapproved', async () => {
      const { assessmentId, sectionId } = await createDraftAssessment(`Q-Publish Lock ${runId}`);
      await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: approvedQuestionId });
      await request(server)
        .post(`/api/v1/assessments/${assessmentId}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [studentId] });
      const publish = await request(server).post(`/api/v1/assessments/${assessmentId}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(publish.status).toBe(200);

      const editAttempt = await request(server)
        .patch(`/api/v1/questions/${approvedQuestionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ marks: 99 });
      expect(editAttempt.status).toBe(409);

      const deleteAttempt = await request(server).delete(`/api/v1/questions/${approvedQuestionId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(deleteAttempt.status).toBe(409);
    });

    it('re-checks approval status at publish time — unapproving an attached question blocks publishing a fresh assessment', async () => {
      const fresh = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreatePayload(`Publish Recheck Question ${runId}`));
      questionIds.push(fresh.body.id);
      await request(server).post(`/api/v1/questions/${fresh.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });

      const { assessmentId, sectionId } = await createDraftAssessment(`Q-Recheck ${runId}`);
      await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: fresh.body.id });
      await request(server)
        .post(`/api/v1/assessments/${assessmentId}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [studentId] });

      // un-approve it while the assessment is still DRAFT (allowed — review isn't structural editing)
      await request(server).post(`/api/v1/questions/${fresh.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'REJECTED' });

      const publish = await request(server).post(`/api/v1/assessments/${assessmentId}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(publish.status).toBe(422);
      expect(publish.body.error.details.some((d: { issue: string }) => d.issue.includes('no longer approved'))).toBe(true);
    });
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

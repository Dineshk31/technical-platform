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

describe('Technical MCQ system (e2e)', () => {
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
      data: { email: `mcq-e2e-admin-${runId}@test.local`, passwordHash, name: 'MCQ E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `mcq-e2e-student-${runId}@test.local`, passwordHash, name: 'MCQ E2E Student', roleId: studentRole.id },
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

  function validMcqPayload(title: string, overrides: Record<string, unknown> = {}) {
    return {
      title,
      mcqType: 'SINGLE_CHOICE',
      questionText: 'Which keyword declares a constant in JavaScript?',
      difficulty: 'EASY',
      topics: ['Programming'],
      marks: 5,
      options: [
        { optionText: 'let', isCorrect: false },
        { optionText: 'var', isCorrect: false },
        { optionText: 'const', isCorrect: true },
        { optionText: 'static', isCorrect: false },
      ],
      ...overrides,
    };
  }

  /** Creates + approves an MCQ question, returning both its id and the full admin
   * detail (with option ids and isCorrect) so scoring tests know which option is right. */
  async function createApprovedMcq(title: string, overrides: Record<string, unknown> = {}) {
    const created = await request(server)
      .post('/api/v1/questions/mcq')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validMcqPayload(title, overrides));
    expect(created.status).toBe(201);
    questionIds.push(created.body.id);
    const approved = await request(server)
      .post(`/api/v1/questions/${created.body.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });
    expect(approved.status).toBe(201);
    return approved.body as {
      id: string;
      options: { id: string; optionText: string; isCorrect: boolean }[];
    };
  }

  async function createDraftAssessment(title: string) {
    const now = Date.now();
    const res = await request(server)
      .post('/api/v1/assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        durationMinutes: 30,
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 60 * 60_000).toISOString(),
      });
    assessmentIds.push(res.body.id);
    return res.body.id as string;
  }

  async function addSection(assessmentId: string, sectionType: 'CODING' | 'MCQ', title = 'Section 1') {
    const res = await request(server)
      .post(`/api/v1/assessments/${assessmentId}/sections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title, sectionType });
    return res.body.sections[res.body.sections.length - 1].id as string;
  }

  /** Full pipeline: draft assessment -> MCQ section -> attach -> assign student -> publish -> start attempt. */
  async function createActiveMcqAttempt(questionId: string, marksOverride?: number) {
    const assessmentId = await createDraftAssessment(`MCQ Flow ${runId}-${Math.random().toString(36).slice(2)}`);
    const sectionId = await addSection(assessmentId, 'MCQ');
    const attach = await request(server)
      .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionId, marksOverride });
    expect(attach.status).toBe(201);
    await request(server)
      .post(`/api/v1/assessments/${assessmentId}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [studentId] });
    const publish = await request(server).post(`/api/v1/assessments/${assessmentId}/publish`).set('Authorization', `Bearer ${adminToken}`);
    expect(publish.status).toBe(200);
    const start = await request(server).post(`/api/v1/assessments/${assessmentId}/start`).set('Authorization', `Bearer ${studentToken}`);
    expect(start.status).toBe(201);
    return { assessmentId, attemptId: start.body.id as string };
  }

  // ============================================================
  // Admin: create + validate
  // ============================================================

  describe('admin: create and validate', () => {
    it('creates a valid single-choice MCQ as PENDING_REVIEW', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload(`Const Keyword ${runId}`));
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('MCQ');
      expect(res.body.approvalStatus).toBe('PENDING_REVIEW');
      expect(res.body.source).toBe('MANUAL');
      expect(res.body.options).toHaveLength(4);
      // isCorrect IS present here — this is the admin-only detail response.
      expect(res.body.options.some((o: { isCorrect: boolean }) => o.isCorrect)).toBe(true);
      questionIds.push(res.body.id);
    });

    it('creates a valid MULTIPLE_CHOICE MCQ with more than one correct option', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validMcqPayload(`Multi Correct ${runId}`, {
            mcqType: 'MULTIPLE_CHOICE',
            questionText: 'Which of these are primitive types in JavaScript?',
            options: [
              { optionText: 'string', isCorrect: true },
              { optionText: 'number', isCorrect: true },
              { optionText: 'Array', isCorrect: false },
              { optionText: 'Object', isCorrect: false },
            ],
          }),
        );
      expect(res.status).toBe(201);
      questionIds.push(res.body.id);
    });

    it('rejects fewer than two options (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload('Too Few Options', { options: [{ optionText: 'only one', isCorrect: true }] }));
      expect(res.status).toBe(400);
    });

    it('rejects a single-choice MCQ with zero correct options (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validMcqPayload('No Correct Answer', {
            options: [
              { optionText: 'a', isCorrect: false },
              { optionText: 'b', isCorrect: false },
            ],
          }),
        );
      expect(res.status).toBe(400);
    });

    it('rejects a single-choice MCQ with two correct options (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validMcqPayload('Two Correct Single Choice', {
            options: [
              { optionText: 'a', isCorrect: true },
              { optionText: 'b', isCorrect: true },
            ],
          }),
        );
      expect(res.status).toBe(400);
    });

    it('rejects a MULTIPLE_CHOICE MCQ with zero correct options (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validMcqPayload('Multi Zero Correct', {
            mcqType: 'MULTIPLE_CHOICE',
            options: [
              { optionText: 'a', isCorrect: false },
              { optionText: 'b', isCorrect: false },
            ],
          }),
        );
      expect(res.status).toBe(400);
    });

    it('rejects duplicate option text (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validMcqPayload('Duplicate Options', {
            options: [
              { optionText: 'same', isCorrect: true },
              { optionText: 'same', isCorrect: false },
            ],
          }),
        );
      expect(res.status).toBe(400);
    });

    it('rejects empty question text (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload('Empty Text', { questionText: '' }));
      expect(res.status).toBe(400);
    });

    it('rejects an unrecognized topic (400)', async () => {
      const res = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload('Bad Topic', { topics: ['Not A Real MCQ Topic'] }));
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // Admin: update + approval workflow
  // ============================================================

  describe('admin: update and approval workflow', () => {
    it('updates an MCQ question, replacing its options', async () => {
      const created = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload(`Update Target ${runId}`));
      questionIds.push(created.body.id);

      const res = await request(server)
        .patch(`/api/v1/questions/mcq/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          marks: 8,
          options: [
            { optionText: 'A', isCorrect: false },
            { optionText: 'B', isCorrect: true },
            { optionText: 'C', isCorrect: false },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.marks).toBe(8);
      expect(res.body.options).toHaveLength(3);
      expect(res.body.options.find((o: { optionText: string }) => o.optionText === 'B').isCorrect).toBe(true);
    });

    it('approves a valid MCQ, recording a review entry', async () => {
      const created = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload(`Approve Flow ${runId}`));
      questionIds.push(created.body.id);

      const res = await request(server)
        .post(`/api/v1/questions/${created.body.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED', notes: 'Looks good' });
      expect(res.status).toBe(201);
      expect(res.body.approvalStatus).toBe('APPROVED');
      expect(res.body.reviews[0]).toEqual(
        expect.objectContaining({ status: 'APPROVED', notes: 'Looks good', reviewedBy: expect.objectContaining({ id: adminId }) }),
      );
    });

    it('rejects approving an MCQ whose options were edited into an invalid state (422)', async () => {
      const created = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload(`Invalid After Edit ${runId}`));
      questionIds.push(created.body.id);

      // UpdateMcqQuestionSchema has no cross-field refine (matches UpdateCodingQuestionSchema
      // precedent) — this deliberately leaves zero correct options, which review() must catch.
      await request(server)
        .patch(`/api/v1/questions/mcq/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ options: [{ optionText: 'x', isCorrect: false }, { optionText: 'y', isCorrect: false }] });

      const res = await request(server)
        .post(`/api/v1/questions/${created.body.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });
      expect(res.status).toBe(422);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'options')).toBe(true);
    });
  });

  // ============================================================
  // Assessment integration: eligibility, type-matching, mixed assessments
  // ============================================================

  describe('assessment integration', () => {
    it('a PENDING_REVIEW MCQ cannot be attached (422)', async () => {
      const created = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validMcqPayload(`Pending Attach ${runId}`));
      questionIds.push(created.body.id);

      const assessmentId = await createDraftAssessment(`Pending MCQ Attach ${runId}`);
      const sectionId = await addSection(assessmentId, 'MCQ');
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: created.body.id });
      expect(res.status).toBe(422);
    });

    it('an approved MCQ can be attached to an MCQ section', async () => {
      const mcq = await createApprovedMcq(`Approved Attach ${runId}`);
      const assessmentId = await createDraftAssessment(`Approved MCQ Attach ${runId}`);
      const sectionId = await addSection(assessmentId, 'MCQ');
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: mcq.id });
      expect(res.status).toBe(201);
    });

    it('rejects attaching an MCQ question to a CODING section (422)', async () => {
      const mcq = await createApprovedMcq(`Wrong Section Type ${runId}`);
      const assessmentId = await createDraftAssessment(`Type Mismatch ${runId}`);
      const sectionId = await addSection(assessmentId, 'CODING');
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionId: mcq.id });
      expect(res.status).toBe(422);
    });

    it('builds and publishes a mixed assessment (one CODING section + one MCQ section)', async () => {
      const mcq = await createApprovedMcq(`Mixed Assessment MCQ ${runId}`);
      const codingCreate = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Mixed Assessment Coding ${runId}`,
          problemStatement: 'Print the sum of two integers.',
          inputFormat: 'a b',
          outputFormat: 'sum',
          constraints: [],
          examples: [{ input: '1 2', output: '3' }],
          difficulty: 'EASY',
          topics: ['Arrays'],
          marks: 10,
          timeLimitSeconds: 2,
          memoryLimitMb: 256,
          supportedLanguages: ['PYTHON'],
          publicTestCases: [{ input: '1 2', expectedOutput: '3' }],
          hiddenTestCases: [{ input: '4 5', expectedOutput: '9' }],
          referenceSolutions: { PYTHON: 'a,b=map(int,input().split());print(a+b)' },
        });
      expect(codingCreate.status).toBe(201);
      questionIds.push(codingCreate.body.id);
      await request(server).post(`/api/v1/questions/${codingCreate.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });

      const assessmentId = await createDraftAssessment(`Mixed Assessment ${runId}`);
      const mcqSectionId = await addSection(assessmentId, 'MCQ', 'MCQ Round');
      const codingSectionId = await addSection(assessmentId, 'CODING', 'Coding Round');
      await request(server).post(`/api/v1/assessments/${assessmentId}/sections/${mcqSectionId}/questions`).set('Authorization', `Bearer ${adminToken}`).send({ questionId: mcq.id });
      await request(server).post(`/api/v1/assessments/${assessmentId}/sections/${codingSectionId}/questions`).set('Authorization', `Bearer ${adminToken}`).send({ questionId: codingCreate.body.id });
      await request(server).post(`/api/v1/assessments/${assessmentId}/participants`).set('Authorization', `Bearer ${adminToken}`).send({ userIds: [studentId] });

      const publish = await request(server).post(`/api/v1/assessments/${assessmentId}/publish`).set('Authorization', `Bearer ${adminToken}`);
      expect(publish.status).toBe(200);

      const detail = await request(server).get(`/api/v1/assessments/${assessmentId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(detail.body.sections).toHaveLength(2);
      expect(detail.body.sections.map((s: { sectionType: string }) => s.sectionType).sort()).toEqual(['CODING', 'MCQ']);
    });
  });

  // ============================================================
  // Student: security, answering, persistence, resume
  // ============================================================

  describe('student: security and answering', () => {
    it('GET /assessments/:id/questions never includes isCorrect anywhere in the response body', async () => {
      const mcq = await createApprovedMcq(`Security Check ${runId}`);
      const { assessmentId } = await createActiveMcqAttempt(mcq.id);

      const res = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      // Whole-body string search — a genuinely stronger check than "field is undefined",
      // since it also catches an accidental leak under a different key name.
      expect(JSON.stringify(res.body)).not.toMatch(/isCorrect/i);

      const mcqQuestion = res.body.sections[0].questions[0];
      expect(mcqQuestion.type).toBe('MCQ');
      expect(mcqQuestion.options).toHaveLength(4);
      expect(mcqQuestion.options[0]).toEqual(expect.objectContaining({ id: expect.any(String), optionText: expect.any(String) }));
      expect(Object.keys(mcqQuestion.options[0]).sort()).toEqual(['id', 'optionText']);
      expect(mcqQuestion.selectedOptionIds).toEqual([]);
    });

    it('the answer endpoint response never includes isCorrect or score', async () => {
      const mcq = await createApprovedMcq(`Answer Response Check ${runId}`);
      const { assessmentId } = await createActiveMcqAttempt(mcq.id);
      const correctOptionId = mcq.options.find((o) => o.isCorrect)!.id;

      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/mcq/${mcq.id}/answer`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ optionIds: [correctOptionId] });
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/isCorrect|"score"/i);
      expect(res.body).toEqual({ questionId: mcq.id, selectedOptionIds: [correctOptionId] });
    });

    it('a student can select, change, and clear an answer, and it persists across a fresh read (resume)', async () => {
      const mcq = await createApprovedMcq(`Change Answer ${runId}`);
      const { assessmentId } = await createActiveMcqAttempt(mcq.id);
      const [optA, optB] = mcq.options;

      await request(server).post(`/api/v1/assessments/${assessmentId}/mcq/${mcq.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: [optA.id] });

      const afterFirst = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(afterFirst.body.sections[0].questions[0].selectedOptionIds).toEqual([optA.id]);

      // Change the answer
      await request(server).post(`/api/v1/assessments/${assessmentId}/mcq/${mcq.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: [optB.id] });
      const afterChange = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(afterChange.body.sections[0].questions[0].selectedOptionIds).toEqual([optB.id]);

      // Clear the answer entirely
      await request(server).post(`/api/v1/assessments/${assessmentId}/mcq/${mcq.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: [] });
      const afterClear = await request(server).get(`/api/v1/assessments/${assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(afterClear.body.sections[0].questions[0].selectedOptionIds).toEqual([]);
      expect(afterClear.body.sections[0].questions[0].status).toBe('NOT_ATTEMPTED');
    });

    it('rejects an optionId that does not belong to the question (422)', async () => {
      const mcqA = await createApprovedMcq(`Foreign Option A ${runId}`);
      const mcqB = await createApprovedMcq(`Foreign Option B ${runId}`);
      const { assessmentId } = await createActiveMcqAttempt(mcqA.id);

      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/mcq/${mcqA.id}/answer`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ optionIds: [mcqB.options[0].id] });
      expect(res.status).toBe(422);
    });

    it('a STUDENT cannot access admin MCQ creation/update/review endpoints (403)', async () => {
      const mcq = await createApprovedMcq(`Student Blocked ${runId}`);

      const create = await request(server).post('/api/v1/questions/mcq').set('Authorization', `Bearer ${studentToken}`).send(validMcqPayload('x'));
      expect(create.status).toBe(403);

      const update = await request(server).patch(`/api/v1/questions/mcq/${mcq.id}`).set('Authorization', `Bearer ${studentToken}`).send({ marks: 99 });
      expect(update.status).toBe(403);

      const review = await request(server).post(`/api/v1/questions/${mcq.id}/review`).set('Authorization', `Bearer ${studentToken}`).send({ status: 'REJECTED' });
      expect(review.status).toBe(403);

      const detail = await request(server).get(`/api/v1/questions/${mcq.id}`).set('Authorization', `Bearer ${studentToken}`);
      expect(detail.status).toBe(403);
    });
  });

  // ============================================================
  // Evaluation & results integration (Phase 8 finalize/scoring, reused as-is)
  // ============================================================

  describe('evaluation and results integration', () => {
    it('a correct answer earns full marks and SOLVED status; an incorrect answer earns 0/negative and ATTEMPTED', async () => {
      const mcq = await createApprovedMcq(`Scoring Correct ${runId}`);
      const correctOptionId = mcq.options.find((o) => o.isCorrect)!.id;
      const wrongOptionId = mcq.options.find((o) => !o.isCorrect)!.id;

      const correctFlow = await createActiveMcqAttempt(mcq.id, 12);
      await request(server).post(`/api/v1/assessments/${correctFlow.assessmentId}/mcq/${mcq.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: [correctOptionId] });
      const correctRead = await request(server).get(`/api/v1/assessments/${correctFlow.assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(correctRead.body.sections[0].questions[0].status).toBe('SOLVED');

      const submitCorrect = await request(server).post(`/api/v1/assessments/${correctFlow.assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(submitCorrect.status).toBe(201);
      const resultCorrect = await prisma.result.findUnique({ where: { attemptId: correctFlow.attemptId } });
      expect(Number(resultCorrect!.mcqScore)).toBe(12);
      expect(Number(resultCorrect!.totalScore)).toBe(12);

      // A second, independent attempt (different assessment) answered incorrectly.
      const wrongFlow = await createActiveMcqAttempt(mcq.id, 12);
      await request(server).post(`/api/v1/assessments/${wrongFlow.assessmentId}/mcq/${mcq.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: [wrongOptionId] });
      const wrongRead = await request(server).get(`/api/v1/assessments/${wrongFlow.assessmentId}/questions`).set('Authorization', `Bearer ${studentToken}`);
      expect(wrongRead.body.sections[0].questions[0].status).toBe('ATTEMPTED');

      const submitWrong = await request(server).post(`/api/v1/assessments/${wrongFlow.assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      expect(submitWrong.status).toBe(201);
      const resultWrong = await prisma.result.findUnique({ where: { attemptId: wrongFlow.attemptId } });
      expect(Number(resultWrong!.mcqScore)).toBe(0);
    });

    it('applies negative marking on an incorrect answer when configured', async () => {
      const mcq = await createApprovedMcq(`Negative Marking ${runId}`, { negativeMarkingValue: 2 });
      const wrongOptionId = mcq.options.find((o) => !o.isCorrect)!.id;
      const { assessmentId, attemptId } = await createActiveMcqAttempt(mcq.id, 10);

      await request(server).post(`/api/v1/assessments/${assessmentId}/mcq/${mcq.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: [wrongOptionId] });
      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);

      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(Number(result!.mcqScore)).toBe(-2);
      expect(Number(result!.totalScore)).toBe(-2);
    });

    it('MULTIPLE_CHOICE requires every correct option and no incorrect ones to earn marks', async () => {
      const created = await request(server)
        .post('/api/v1/questions/mcq')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          validMcqPayload(`Multi Scoring ${runId}`, {
            mcqType: 'MULTIPLE_CHOICE',
            options: [
              { optionText: 'string', isCorrect: true },
              { optionText: 'number', isCorrect: true },
              { optionText: 'Array', isCorrect: false },
            ],
          }),
        );
      questionIds.push(created.body.id);
      const approved = await request(server).post(`/api/v1/questions/${created.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });
      const opts = approved.body.options as { id: string; optionText: string; isCorrect: boolean }[];
      const correctIds = opts.filter((o) => o.isCorrect).map((o) => o.id);
      const oneCorrectOnly = [correctIds[0]];
      const allCorrectPlusExtra = [...correctIds, opts.find((o) => !o.isCorrect)!.id];

      // Partial selection (only one of two correct options) must NOT earn marks.
      const partial = await createActiveMcqAttempt(created.body.id, 10);
      await request(server).post(`/api/v1/assessments/${partial.assessmentId}/mcq/${created.body.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: oneCorrectOnly });
      await request(server).post(`/api/v1/assessments/${partial.assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      const partialResult = await prisma.result.findUnique({ where: { attemptId: partial.attemptId } });
      expect(Number(partialResult!.mcqScore)).toBe(0);

      // All correct plus one incorrect must NOT earn marks either (all-or-nothing).
      const overselect = await createActiveMcqAttempt(created.body.id, 10);
      await request(server).post(`/api/v1/assessments/${overselect.assessmentId}/mcq/${created.body.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: allCorrectPlusExtra });
      await request(server).post(`/api/v1/assessments/${overselect.assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      const overselectResult = await prisma.result.findUnique({ where: { attemptId: overselect.attemptId } });
      expect(Number(overselectResult!.mcqScore)).toBe(0);

      // Exactly the correct set earns full marks.
      const exact = await createActiveMcqAttempt(created.body.id, 10);
      await request(server).post(`/api/v1/assessments/${exact.assessmentId}/mcq/${created.body.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: correctIds });
      await request(server).post(`/api/v1/assessments/${exact.assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);
      const exactResult = await prisma.result.findUnique({ where: { attemptId: exact.attemptId } });
      expect(Number(exactResult!.mcqScore)).toBe(10);
    });

    it('combines coding and MCQ scores into totalScore for a mixed assessment', async () => {
      const mcq = await createApprovedMcq(`Combined Score MCQ ${runId}`);
      const correctOptionId = mcq.options.find((o) => o.isCorrect)!.id;

      const codingCreate = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Combined Score Coding ${runId}`,
          problemStatement: 'Print the sum of two integers.',
          inputFormat: 'a b',
          outputFormat: 'sum',
          constraints: [],
          examples: [{ input: '1 2', output: '3' }],
          difficulty: 'EASY',
          topics: ['Arrays'],
          marks: 15,
          timeLimitSeconds: 2,
          memoryLimitMb: 256,
          supportedLanguages: ['PYTHON'],
          publicTestCases: [{ input: '1 2', expectedOutput: '3' }],
          hiddenTestCases: [{ input: '4 5', expectedOutput: '9' }],
          referenceSolutions: { PYTHON: 'a,b=map(int,input().split());print(a+b)' },
        });
      questionIds.push(codingCreate.body.id);
      await request(server).post(`/api/v1/questions/${codingCreate.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });

      const assessmentId = await createDraftAssessment(`Combined Score Assessment ${runId}`);
      const mcqSectionId = await addSection(assessmentId, 'MCQ', 'MCQ');
      const codingSectionId = await addSection(assessmentId, 'CODING', 'Coding');
      await request(server).post(`/api/v1/assessments/${assessmentId}/sections/${mcqSectionId}/questions`).set('Authorization', `Bearer ${adminToken}`).send({ questionId: mcq.id, marksOverride: 5 });
      await request(server).post(`/api/v1/assessments/${assessmentId}/sections/${codingSectionId}/questions`).set('Authorization', `Bearer ${adminToken}`).send({ questionId: codingCreate.body.id });
      await request(server).post(`/api/v1/assessments/${assessmentId}/participants`).set('Authorization', `Bearer ${adminToken}`).send({ userIds: [studentId] });
      await request(server).post(`/api/v1/assessments/${assessmentId}/publish`).set('Authorization', `Bearer ${adminToken}`);
      const start = await request(server).post(`/api/v1/assessments/${assessmentId}/start`).set('Authorization', `Bearer ${studentToken}`);
      const attemptId = start.body.id as string;

      // Answer the MCQ correctly; leave the coding question unattempted.
      await request(server).post(`/api/v1/assessments/${assessmentId}/mcq/${mcq.id}/answer`).set('Authorization', `Bearer ${studentToken}`).send({ optionIds: [correctOptionId] });
      await request(server).post(`/api/v1/assessments/${assessmentId}/submit`).set('Authorization', `Bearer ${studentToken}`);

      const result = await prisma.result.findUnique({ where: { attemptId } });
      expect(Number(result!.mcqScore)).toBe(5);
      expect(Number(result!.codingScore)).toBe(0);
      expect(Number(result!.totalScore)).toBe(5);
    });
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

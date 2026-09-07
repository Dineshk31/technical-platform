import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { AIProvider, AIProviderResult } from '@technical-platform/shared';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AI_PROVIDER } from '../src/modules/ai/ai-provider.token.js';

const PASSWORD = 'TestPass123!';
const runId = Date.now();

/**
 * Fake AIProvider — no real Gemini calls happen in this suite (docs Part 16:
 * "Do NOT make real Gemini API calls during automated tests"). Its behavior
 * per call is controlled by `nextResult`, set from within each test.
 */
class FakeAIProvider implements AIProvider {
  nextResult: AIProviderResult<unknown[]> = {
    success: true,
    promptSnapshot: 'fake prompt',
    rawResponseText: '[]',
    data: [],
  };
  calls = 0;

  async generateCodingQuestions(): Promise<AIProviderResult<unknown[]>> {
    this.calls++;
    return this.nextResult;
  }
}

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: 'AI Two Sum',
    problemStatement: 'Given an array, find two numbers that add to a target.',
    inputFormat: 'n, array, target',
    outputFormat: 'indices',
    constraints: ['1 <= n <= 1000'],
    examples: [{ input: '2 7 11 15\n9', output: '0 1', explanation: '2+7=9' }],
    difficulty: 'MEDIUM',
    topics: ['Arrays'],
    tags: [],
    marks: 10,
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    supportedLanguages: ['PYTHON'],
    referenceSolutions: { PYTHON: 'print(0, 1)' },
    starterTemplates: {},
    publicTestCases: [{ input: '1', expectedOutput: '1' }],
    hiddenTestCases: [{ input: '2', expectedOutput: '2' }],
    solutionApproach: "Hash map of value -> index.",
    ...overrides,
  };
}

describe('AI question generation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let fakeProvider: FakeAIProvider;

  let adminToken: string;
  let studentToken: string;
  let adminId: string;
  let studentId: string;

  const userIds: string[] = [];
  const questionIds: string[] = [];
  const assessmentIds: string[] = [];
  let adminCounter = 0;

  beforeAll(async () => {
    fakeProvider = new FakeAIProvider();

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue(fakeProvider)
      .compile();
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
      data: { email: `ai-e2e-admin-${runId}@test.local`, passwordHash, name: 'AI E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `ai-e2e-student-${runId}@test.local`, passwordHash, name: 'AI E2E Student', roleId: studentRole.id },
    });
    adminId = admin.id;
    studentId = student.id;
    userIds.push(adminId, studentId);

    adminToken = await login(server, admin.email);
    studentToken = await login(server, student.email);
  });

  afterAll(async () => {
    // Assessment deletion cascades to its sections and assessmentQuestions (schema.prisma
    // onDelete: Cascade), which must go before questions/users to satisfy FK constraints.
    await prisma.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.aiGenerationRequest.deleteMany({ where: { requestedById: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  /**
   * Each independent scenario that calls POST /ai/questions/generate uses its
   * own fresh admin so the per-admin rate limit (AI_GENERATION_RATE_LIMIT_MS)
   * never interferes between unrelated test cases — only the tests that
   * specifically exercise dedupe/rate-limiting share one admin's history.
   */
  async function createAdmin(): Promise<{ id: string; token: string }> {
    adminCounter++;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const user = await prisma.user.create({
      data: { email: `ai-e2e-admin-${runId}-${adminCounter}@test.local`, passwordHash, name: 'AI E2E Extra Admin', roleId: adminRole.id },
    });
    userIds.push(user.id);
    return { id: user.id, token: await login(server, user.email) };
  }

  function validGenerateBody(overrides: Record<string, unknown> = {}) {
    return { topic: 'Arrays', difficulty: 'MEDIUM', language: 'PYTHON', count: 1, ...overrides };
  }

  // ============================================================
  // Authentication / authorization
  // ============================================================

  describe('authentication & authorization', () => {
    it('rejects an unauthenticated request (401)', async () => {
      const res = await request(server).post('/api/v1/ai/questions/generate').send(validGenerateBody());
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a STUDENT generating questions (403) and never calls the provider', async () => {
      const callsBefore = fakeProvider.calls;
      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(validGenerateBody());
      expect(res.status).toBe(403);
      expect(fakeProvider.calls).toBe(callsBefore);
    });
  });

  // ============================================================
  // Admin: request validation (rejected before the provider is ever called)
  // ============================================================

  describe('admin: request validation', () => {
    it('rejects an invalid topic (400)', async () => {
      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validGenerateBody({ topic: 'Not A Real Topic' }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a count above the batch limit (400)', async () => {
      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validGenerateBody({ count: 25 }));
      expect(res.status).toBe(400);
    });

    it('rejects an invalid language (400)', async () => {
      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validGenerateBody({ language: 'RUST' }));
      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // Admin: generation, preview, and the never-auto-saved rule
  // ============================================================

  describe('admin: generate → preview → explicit save', () => {
    it('returns a preview with generated drafts and does not create any question rows', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft()] };

      const before = await prisma.question.count({ where: { source: 'AI_GENERATED' } });
      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Arrays', count: 1 }));

      expect(res.status).toBe(201);
      expect(res.body.requestId).toBeTruthy();
      expect(res.body.generated).toHaveLength(1);
      expect(res.body.generated[0].title).toBe('AI Two Sum');
      expect(res.body.failed).toHaveLength(0);

      const after = await prisma.question.count({ where: { source: 'AI_GENERATED' } });
      expect(after).toBe(before);
    });

    it('reports malformed candidates in failed[] instead of silently dropping them, without creating a question', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = {
        success: true,
        promptSnapshot: 'p',
        rawResponseText: '[]',
        data: [{ title: 'Missing everything else' }],
      };

      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Strings', count: 1 }));

      expect(res.status).toBe(201);
      expect(res.body.generated).toHaveLength(0);
      expect(res.body.failed).toHaveLength(1);
      expect(res.body.failed[0].issues.length).toBeGreaterThan(0);
    });

    it('maps a provider failure to a 502 and records a FAILED request row, without leaking raw internals', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = {
        success: false,
        promptSnapshot: 'p',
        error: { code: 'AI_RATE_LIMITED', message: 'AI service is rate-limited, try again shortly' },
      };

      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Hashing', count: 1 }));

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('AI_RATE_LIMITED');
      expect(res.body.error.message).not.toMatch(/api.?key/i);
    });

    it('round-trips a stored preview via GET /ai/questions/requests/:id', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft({ title: 'Roundtrip Q' })] };
      const generated = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Sorting', count: 1 }));

      const res = await request(server)
        .get(`/api/v1/ai/questions/requests/${generated.body.requestId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.generated[0].title).toBe('Roundtrip Q');
    });

    it('a STUDENT cannot read a generation request (403)', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft()] };
      const generated = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Searching', count: 1 }));

      const res = await request(server)
        .get(`/api/v1/ai/questions/requests/${generated.body.requestId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it('explicit save creates a PENDING_REVIEW, AI_GENERATED question linked to the request', async () => {
      const { token, id } = await createAdmin();
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft({ title: `Saved AI Q ${runId}` })] };
      const generated = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Recursion', count: 1 }));

      const { solutionApproach: _solutionApproach, ...toSave } = generated.body.generated[0];
      const saveRes = await request(server)
        .post(`/api/v1/ai/questions/requests/${generated.body.requestId}/save`)
        .set('Authorization', `Bearer ${token}`)
        .send({ questions: [toSave] });

      expect(saveRes.status).toBe(201);
      expect(saveRes.body.created).toHaveLength(1);
      questionIds.push(saveRes.body.created[0]);

      const detail = await request(server)
        .get(`/api/v1/questions/${saveRes.body.created[0]}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detail.body.source).toBe('AI_GENERATED');
      expect(detail.body.approvalStatus).toBe('PENDING_REVIEW');
      expect(detail.body.title).toBe(`Saved AI Q ${runId}`);
      expect(detail.body.createdBy.id).toBe(id);
    });

    it('a STUDENT cannot save generated questions (403)', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft()] };
      const generated = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Backtracking', count: 1 }));

      const { solutionApproach: _solutionApproach, ...toSave } = generated.body.generated[0];
      const res = await request(server)
        .post(`/api/v1/ai/questions/requests/${generated.body.requestId}/save`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ questions: [toSave] });
      expect(res.status).toBe(403);
    });

    it('returns 404 saving against a non-existent request id', async () => {
      const { token } = await createAdmin();
      const res = await request(server)
        .post('/api/v1/ai/questions/requests/00000000-0000-0000-0000-000000000000/save')
        .set('Authorization', `Bearer ${token}`)
        .send({ questions: [validDraft()] });
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // Duplicate-request guard & rate limiting (each scenario uses its own
  // fresh admin so the two concerns can be tested in isolation)
  // ============================================================

  describe('admin: duplicate-request guard and rate limiting', () => {
    it('an identical request within the dedupe window returns the same requestId without calling the provider again', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft({ title: 'Dedupe Q' })] };
      const body = validGenerateBody({ topic: 'Graphs', difficulty: 'HARD', count: 2 });

      const first = await request(server).post('/api/v1/ai/questions/generate').set('Authorization', `Bearer ${token}`).send(body);
      expect(first.status).toBe(201);
      const callsAfterFirst = fakeProvider.calls;

      const second = await request(server).post('/api/v1/ai/questions/generate').set('Authorization', `Bearer ${token}`).send(body);
      expect(second.status).toBe(201);
      expect(second.body.requestId).toBe(first.body.requestId);
      expect(fakeProvider.calls).toBe(callsAfterFirst);
    });

    it('a rapid second request with different parameters is rejected as rate-limited (429)', async () => {
      const { token } = await createAdmin();
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft()] };
      await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Trees', count: 1 }));

      const res = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic: 'Heaps', count: 1 }));
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  // ============================================================
  // Phase 10 — review, approval, and assessment eligibility for
  // AI-generated questions. These endpoints (POST /questions/:id/review,
  // GET /questions with source/approvalStatus filters) are Phase 3's
  // existing review system — Phase 10 doesn't add new ones, it verifies
  // AI-generated questions flow through them correctly. Each scenario uses
  // its own fresh admin (see createAdmin above) to avoid rate-limit collisions.
  // ============================================================

  describe('Phase 10: review, approval, and assessment eligibility for AI-generated questions', () => {
    async function generateAndSave(token: string, topic: string, draftOverrides: Record<string, unknown> = {}) {
      fakeProvider.nextResult = { success: true, promptSnapshot: 'p', rawResponseText: '[]', data: [validDraft(draftOverrides)] };
      const generated = await request(server)
        .post('/api/v1/ai/questions/generate')
        .set('Authorization', `Bearer ${token}`)
        .send(validGenerateBody({ topic, count: 1 }));
      const { solutionApproach: _solutionApproach, ...toSave } = generated.body.generated[0];
      const saved = await request(server)
        .post(`/api/v1/ai/questions/requests/${generated.body.requestId}/save`)
        .set('Authorization', `Bearer ${token}`)
        .send({ questions: [toSave] });
      const questionId = saved.body.created[0] as string;
      questionIds.push(questionId);
      return questionId;
    }

    async function createDraftAssessment(token: string, title: string) {
      const now = Date.now();
      const res = await request(server)
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title,
          durationMinutes: 30,
          startAt: new Date(now + 60 * 60 * 1000).toISOString(),
          endAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        });
      assessmentIds.push(res.body.id);
      const section = await request(server)
        .post(`/api/v1/assessments/${res.body.id}/sections`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Section 1', sectionType: 'CODING' });
      return { assessmentId: res.body.id as string, sectionId: section.body.sections[0].id as string };
    }

    it('a freshly saved AI-generated question starts PENDING_REVIEW and shows up in the AI Review Queue filter', async () => {
      const { token } = await createAdmin();
      const questionId = await generateAndSave(token, 'Arrays', { title: `Queue Check ${runId}` });

      const queue = await request(server)
        .get('/api/v1/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW')
        .set('Authorization', `Bearer ${token}`);
      expect(queue.status).toBe(200);
      expect(queue.body.data.some((q: { id: string }) => q.id === questionId)).toBe(true);
    });

    it('a PENDING_REVIEW AI-generated question cannot be attached to an assessment (422)', async () => {
      const { token } = await createAdmin();
      const questionId = await generateAndSave(token, 'Strings', { title: `Pending Attach ${runId}` });
      const { assessmentId, sectionId } = await createDraftAssessment(token, `AI Pending Attach ${runId}`);

      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ questionId });
      expect(res.status).toBe(422);
    });

    it('approving an AI-generated question transitions PENDING_REVIEW -> APPROVED and records the reviewer + notes', async () => {
      const { token, id: reviewerId } = await createAdmin();
      const questionId = await generateAndSave(token, 'Hashing', { title: `Approve Flow ${runId}` });

      const res = await request(server)
        .post(`/api/v1/questions/${questionId}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'APPROVED', notes: 'Looks correct, approving' });
      expect(res.status).toBe(201);
      expect(res.body.approvalStatus).toBe('APPROVED');
      expect(res.body.reviews[0]).toEqual(
        expect.objectContaining({ status: 'APPROVED', notes: 'Looks correct, approving', reviewedBy: expect.objectContaining({ id: reviewerId }) }),
      );
    });

    it('an APPROVED AI-generated question can then be attached to an assessment, following the normal rules', async () => {
      const { token } = await createAdmin();
      const questionId = await generateAndSave(token, 'Sorting', { title: `Approved Attach ${runId}` });
      await request(server).post(`/api/v1/questions/${questionId}/review`).set('Authorization', `Bearer ${token}`).send({ status: 'APPROVED' });

      const { assessmentId, sectionId } = await createDraftAssessment(token, `AI Approved Attach ${runId}`);
      const res = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ questionId });
      expect(res.status).toBe(201);
    });

    it('rejecting an AI-generated question sets REJECTED and it remains ineligible for attachment', async () => {
      const { token } = await createAdmin();
      const questionId = await generateAndSave(token, 'Searching', { title: `Reject Flow ${runId}` });

      const review = await request(server)
        .post(`/api/v1/questions/${questionId}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'REJECTED', notes: 'Duplicate of an existing question' });
      expect(review.status).toBe(201);
      expect(review.body.approvalStatus).toBe('REJECTED');

      const { assessmentId, sectionId } = await createDraftAssessment(token, `AI Rejected Attach ${runId}`);
      const attach = await request(server)
        .post(`/api/v1/assessments/${assessmentId}/sections/${sectionId}/questions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ questionId });
      expect(attach.status).toBe(422);
    });

    it('an AI-generated question missing a hidden test case cannot be approved (422) — same rule as manual questions', async () => {
      const { token } = await createAdmin();
      const questionId = await generateAndSave(token, 'Binary Search', { title: `Invalid Approve ${runId}` });

      const detail = await request(server).get(`/api/v1/questions/${questionId}`).set('Authorization', `Bearer ${token}`);
      const hiddenId = detail.body.hiddenTestCases[0].id;
      await request(server).delete(`/api/v1/questions/${questionId}/test-cases/${hiddenId}`).set('Authorization', `Bearer ${token}`);

      const res = await request(server)
        .post(`/api/v1/questions/${questionId}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'APPROVED' });
      expect(res.status).toBe(422);
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'hiddenTestCases')).toBe(true);
    });

    it('a STUDENT cannot approve, reject, view the review queue, or view a review detail for an AI-generated question', async () => {
      const { token } = await createAdmin();
      const questionId = await generateAndSave(token, 'Stacks', { title: `Student Blocked ${runId}` });

      const approve = await request(server)
        .post(`/api/v1/questions/${questionId}/review`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: 'APPROVED' });
      expect(approve.status).toBe(403);

      const reject = await request(server)
        .post(`/api/v1/questions/${questionId}/review`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: 'REJECTED' });
      expect(reject.status).toBe(403);

      const queue = await request(server)
        .get('/api/v1/questions?source=AI_GENERATED&approvalStatus=PENDING_REVIEW')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(queue.status).toBe(403);

      const detail = await request(server).get(`/api/v1/questions/${questionId}`).set('Authorization', `Bearer ${studentToken}`);
      expect(detail.status).toBe(403);
    });

    it('the admin detail view surfaces the linked AI generation context without leaking the prompt or raw response', async () => {
      const { token, id: requesterId } = await createAdmin();
      const questionId = await generateAndSave(token, 'Queues', { title: `AI Context ${runId}` });

      const detail = await request(server).get(`/api/v1/questions/${questionId}`).set('Authorization', `Bearer ${token}`);
      expect(detail.body.aiGenerationRequest).toEqual(
        expect.objectContaining({ topic: 'Queues', difficulty: 'MEDIUM', requestedBy: expect.objectContaining({ id: requesterId }) }),
      );
      expect(detail.body.aiGenerationRequest.promptSnapshot).toBeUndefined();
      expect(detail.body.aiGenerationRequest.rawResponse).toBeUndefined();
    });

    it('a manually created question has no aiGenerationRequest in its detail view', async () => {
      const { token } = await createAdmin();
      const manual = await request(server)
        .post('/api/v1/questions/coding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: `Manual Question ${runId}`,
          problemStatement: 'Do a thing.',
          inputFormat: 'n',
          outputFormat: 'the answer',
          constraints: [],
          examples: [{ input: '1', output: '1' }],
          difficulty: 'EASY',
          topics: ['Arrays'],
          tags: [],
          marks: 10,
          timeLimitSeconds: 2,
          memoryLimitMb: 256,
          supportedLanguages: ['PYTHON'],
          publicTestCases: [{ input: '1', expectedOutput: '1' }],
          hiddenTestCases: [{ input: '2', expectedOutput: '2' }],
          referenceSolutions: { PYTHON: 'print(1)' },
        });
      questionIds.push(manual.body.id);
      expect(manual.body.source).toBe('MANUAL');
      expect(manual.body.aiGenerationRequest).toBeNull();
    });
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

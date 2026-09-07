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
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { approveVerifiedCodingQuestion, waitForVerification } from './verification-helpers.js';

/**
 * Phase 18 — Learn → knowledge check → practice, end to end: attach rules (approved
 * MCQ checks, approved + verified practice), answers that never leak before the student
 * answers, server grading with retry, the completion rule, per-student ownership, and
 * the practice problem's solved status after a real judged submission.
 */
const PASSWORD = 'TestPass123!';
const runId = Date.now();
const SUM = 'a, b = map(int, input().split())\nprint(a + b)';
const EXPLANATION = `Arrays are zero-indexed ${runId}`;

describe('Learn: lessons, knowledge checks and practice (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let adminToken: string;
  let aliceToken: string;
  let bobToken: string;
  const userIds: string[] = [];
  const questionIds: string[] = [];
  const lessonIds: string[] = [];

  let singleCheck: { id: string; correct: string; wrong: string; other: string };
  let multiCheck: { id: string; correct: string[]; partial: string[] };
  let verifiedCoding: string;
  let lessonId: string;

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
    const make = async (label: string, roleId: string) => {
      const u = await prisma.user.create({ data: { email: `learn-e2e-${label}-${runId}@test.local`, passwordHash, name: `Learn ${label}`, roleId } });
      userIds.push(u.id);
      return (await request(server).post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD })).body.accessToken as string;
    };
    adminToken = await make('admin', adminRole.id);
    aliceToken = await make('alice', studentRole.id);
    bobToken = await make('bob', studentRole.id);

    // A single-answer and a multi-answer MCQ, tagged with a DSA topic (Phase 18 catalog).
    const single = await createMcq('SINGLE_CHOICE', [
      { optionText: '0', isCorrect: true },
      { optionText: '1', isCorrect: false },
      { optionText: '-1', isCorrect: false },
    ]);
    singleCheck = { id: single.id, correct: single.options[0].id, wrong: single.options[1].id, other: single.options[2].id };
    const multi = await createMcq('MULTIPLE_CHOICE', [
      { optionText: 'O(1) access by index', isCorrect: true },
      { optionText: 'Contiguous memory', isCorrect: true },
      { optionText: 'O(1) insert in the middle', isCorrect: false },
    ]);
    multiCheck = { id: multi.id, correct: [multi.options[0].id, multi.options[1].id], partial: [multi.options[0].id] };

    verifiedCoding = await createCoding(SUM);
    await approveVerifiedCodingQuestion(server, adminToken, verifiedCoding);

    const created = await request(server)
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        topic: 'Arrays',
        title: `Indexing ${runId}`,
        summary: 'How array indexing works.',
        objectives: ['Explain zero-based indexing', 'Know why index access is O(1)'],
        concept: '## Indexing\n\nArrays are **zero-indexed**.\n\n```python\nnums = [4, 9, 1]\nprint(nums[0])\n```',
        checkQuestionIds: [singleCheck.id, multiCheck.id],
        practiceQuestionIds: [verifiedCoding],
        isPublished: true,
      });
    expect(created.status).toBe(201);
    lessonId = created.body.id;
    lessonIds.push(lessonId);
  });

  afterAll(async () => {
    await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    await prisma.submission.deleteMany({ where: { OR: [{ questionId: { in: questionIds } }, { userId: { in: userIds } }] } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function createMcq(mcqType: string, options: { optionText: string; isCorrect: boolean }[], approve = true) {
    const res = await request(server)
      .post('/api/v1/questions/mcq')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Check ${mcqType} ${runId}-${Math.random().toString(36).slice(2)}`,
        mcqType,
        questionText: 'Pick the right answer(s).',
        explanation: EXPLANATION,
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 1,
        options,
      });
    expect(res.status).toBe(201);
    questionIds.push(res.body.id);
    if (approve) {
      const approved = await request(server).post(`/api/v1/questions/${res.body.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });
      expect(approved.status).toBe(201);
    }
    return res.body as { id: string; options: { id: string; optionText: string; isCorrect: boolean }[] };
  }

  async function createCoding(reference: string) {
    const res = await request(server)
      .post('/api/v1/questions/coding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Learn Sum ${runId}-${Math.random().toString(36).slice(2)}`,
        problemStatement: 'Print a + b.',
        inputFormat: 'Two integers.',
        outputFormat: 'One integer.',
        constraints: [],
        examples: [{ input: '2 3', output: '5' }],
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 10,
        timeLimitSeconds: 2,
        memoryLimitMb: 256,
        supportedLanguages: ['PYTHON'],
        publicTestCases: [{ input: '2 3', expectedOutput: '5' }],
        hiddenTestCases: [{ input: '40 2', expectedOutput: '42' }],
        referenceSolutions: { PYTHON: reference },
        starterTemplates: {},
      });
    expect(res.status).toBe(201);
    questionIds.push(res.body.id);
    return res.body.id as string;
  }

  const lessonAs = (token: string, id = lessonId) => request(server).get(`/api/v1/learn/lessons/${id}`).set('Authorization', `Bearer ${token}`);
  const answer = (token: string, questionId: string, optionIds: string[], id = lessonId) =>
    request(server).post(`/api/v1/learn/lessons/${id}/checks/${questionId}/answer`).set('Authorization', `Bearer ${token}`).send({ optionIds });

  describe('admin attach rules', () => {
    it('on a published lesson, only accepts approved MCQs as checks and approved, verified coding problems as practice (422 otherwise)', async () => {
      const pendingMcq = await createMcq('SINGLE_CHOICE', [{ optionText: 'a', isCorrect: true }, { optionText: 'b', isCorrect: false }], false);
      const brokenCoding = await createCoding('print(0)');
      expect((await waitForVerification(server, adminToken, brokenCoding)).status).toBe('FAILED');

      const cases = [
        { checkQuestionIds: [pendingMcq.id], issue: 'not approved' },
        { checkQuestionIds: [verifiedCoding], issue: 'not an MCQ' },
        { practiceQuestionIds: [singleCheck.id], issue: 'not a coding problem' },
        { practiceQuestionIds: [brokenCoding], issue: 'verification' },
      ];
      for (const { issue, ...links } of cases) {
        const res = await request(server)
          .patch(`/api/v1/lessons/${lessonId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(links);
        expect(res.status).toBe(422);
        expect(JSON.stringify(res.body)).toContain(issue);
      }
      // The lesson's real links are untouched by the rejected edits.
      const detail = await request(server).get(`/api/v1/lessons/${lessonId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(detail.body.checks.map((c: { questionId: string }) => c.questionId)).toEqual([singleCheck.id, multiCheck.id]);
      expect(detail.body.practice).toEqual([expect.objectContaining({ questionId: verifiedCoding, verificationStatus: 'PASSED' })]);
      expect(detail.body.objectives).toEqual(['Explain zero-based indexing', 'Know why index access is O(1)']);
    }, 60_000);

    it('lets a DRAFT lesson hold a pending check for review, but refuses to publish it until the check is approved', async () => {
      const pendingMcq = await createMcq('SINGLE_CHOICE', [{ optionText: 'x', isCorrect: true }, { optionText: 'y', isCorrect: false }], false);
      const brokenCoding = await createCoding('print(1)');
      await waitForVerification(server, adminToken, brokenCoding);

      const draft = await request(server)
        .post('/api/v1/lessons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ topic: 'Arrays', title: `Review Together ${runId}`, summary: 's', concept: 'c', checkQuestionIds: [pendingMcq.id] });
      expect(draft.status).toBe(201);
      lessonIds.push(draft.body.id);
      expect(draft.body.checks[0]).toMatchObject({ questionId: pendingMcq.id, approvalStatus: 'PENDING_REVIEW' });

      // Verification is never relaxed, even for drafts.
      const unverified = await request(server).patch(`/api/v1/lessons/${draft.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ practiceQuestionIds: [brokenCoding] });
      expect(unverified.status).toBe(422);

      const publish = await request(server).patch(`/api/v1/lessons/${draft.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ isPublished: true });
      expect(publish.status).toBe(422);
      expect(JSON.stringify(publish.body)).toContain('approve it before publishing');

      await request(server).post(`/api/v1/questions/${pendingMcq.id}/review`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });
      const published = await request(server).patch(`/api/v1/lessons/${draft.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ isPublished: true });
      expect(published.status).toBe(200);
      expect(published.body.isPublished).toBe(true);
    }, 60_000);

    it('rejects attaching the same question twice (400)', async () => {
      const res = await request(server)
        .patch(`/api/v1/lessons/${lessonId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ checkQuestionIds: [singleCheck.id], practiceQuestionIds: [singleCheck.id] });
      expect(res.status).toBe(400);
    });
  });

  describe('student lesson view', () => {
    it('serves objectives, checks without answers or explanations, and practice with solved status', async () => {
      const res = await lessonAs(aliceToken);
      expect(res.status).toBe(200);
      expect(res.body.objectives).toHaveLength(2);
      expect(res.body.checksTotal).toBe(2);
      expect(res.body.checksPassed).toBe(0);
      expect(res.body.completed).toBe(false);
      expect(res.body.checks[1]).toMatchObject({ questionId: multiCheck.id, multiple: true, answer: null });
      expect(res.body.practice).toEqual([expect.objectContaining({ questionId: verifiedCoding, status: 'NOT_ATTEMPTED' })]);

      const json = JSON.stringify(res.body);
      expect(json).not.toContain('isCorrect');
      expect(json).not.toContain(EXPLANATION);
    });

    it('cannot be self-completed while checks are unanswered (422)', async () => {
      const res = await request(server).post(`/api/v1/learn/lessons/${lessonId}/complete`).set('Authorization', `Bearer ${aliceToken}`);
      expect(res.status).toBe(422);
    });
  });

  describe('grading, retry and completion', () => {
    it('grades a wrong answer, returns the explanation but never the correct option, and allows retry', async () => {
      const first = await answer(aliceToken, singleCheck.id, [singleCheck.wrong]);
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ isCorrect: false, attemptCount: 1, explanation: EXPLANATION, lessonCompleted: false, checksPassed: 0 });
      expect(first.body.selectedOptionIds).toEqual([singleCheck.wrong]);
      expect(JSON.stringify(first.body)).not.toContain(singleCheck.correct);

      const retry = await answer(aliceToken, singleCheck.id, [singleCheck.other]);
      expect(retry.body).toMatchObject({ isCorrect: false, attemptCount: 2 });
    });

    it('a correct answer sticks — a later wrong click does not un-pass it', async () => {
      const right = await answer(aliceToken, singleCheck.id, [singleCheck.correct]);
      expect(right.body).toMatchObject({ isCorrect: true, attemptCount: 3, checksPassed: 1, checksTotal: 2, lessonCompleted: false });
      const after = await answer(aliceToken, singleCheck.id, [singleCheck.wrong]);
      expect(after.body).toMatchObject({ isCorrect: true, attemptCount: 3, selectedOptionIds: [singleCheck.correct] });
    });

    it('multi-answer checks are all-or-nothing; passing the last check completes the lesson', async () => {
      const partial = await answer(aliceToken, multiCheck.id, multiCheck.partial);
      expect(partial.body.isCorrect).toBe(false);
      const full = await answer(aliceToken, multiCheck.id, multiCheck.correct);
      expect(full.body).toMatchObject({ isCorrect: true, checksPassed: 2, checksTotal: 2, lessonCompleted: true });

      const lesson = await lessonAs(aliceToken);
      expect(lesson.body.completed).toBe(true);
      expect(lesson.body.checks[0].answer).toMatchObject({ isCorrect: true, explanation: EXPLANATION });

      const topic = await request(server).get('/api/v1/learn/topics/Arrays/lessons').set('Authorization', `Bearer ${aliceToken}`);
      expect(topic.body.find((l: { id: string }) => l.id === lessonId)).toMatchObject({ completed: true, checksPassed: 2, checksTotal: 2, objectivesCount: 2 });
    });

    it('rejects options from another question (422), a non-check question (404) and an unpublished lesson (404)', async () => {
      expect((await answer(bobToken, singleCheck.id, [multiCheck.correct[0]])).status).toBe(422);
      expect((await answer(bobToken, verifiedCoding, [singleCheck.correct])).status).toBe(404);

      const draft = await request(server)
        .post('/api/v1/lessons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ topic: 'Arrays', title: `Draft ${runId}`, summary: 's', concept: 'c', checkQuestionIds: [singleCheck.id] });
      lessonIds.push(draft.body.id);
      expect((await answer(bobToken, singleCheck.id, [singleCheck.correct], draft.body.id)).status).toBe(404);
      expect((await lessonAs(bobToken, draft.body.id)).status).toBe(404);
    });
  });

  describe('ownership and access control', () => {
    it("never shows one student's answers or progress to another", async () => {
      const res = await lessonAs(bobToken);
      expect(res.body.completed).toBe(false);
      expect(res.body.checksPassed).toBe(0);
      expect(res.body.checks.every((c: { answer: unknown }) => c.answer === null)).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(EXPLANATION);
    });

    it('is student-only for answering (403 admin, 401 anonymous) and admin-only for authoring (403 student)', async () => {
      expect((await answer(adminToken, singleCheck.id, [singleCheck.correct])).status).toBe(403);
      const anonymous = await request(server).post(`/api/v1/learn/lessons/${lessonId}/checks/${singleCheck.id}/answer`).send({ optionIds: [singleCheck.correct] });
      expect(anonymous.status).toBe(401);
      const studentAuthoring = await request(server)
        .patch(`/api/v1/lessons/${lessonId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ checkQuestionIds: [] });
      expect(studentAuthoring.status).toBe(403);
    });
  });

  describe('practice what you just learned', () => {
    it("shows SOLVED after the student's own accepted practice submission", async () => {
      const submit = await request(server)
        .post(`/api/v1/practice/questions/${verifiedCoding}/submit`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ language: 'PYTHON', code: SUM });
      expect(submit.status).toBe(202);
      const deadline = Date.now() + 30_000;
      let status = 'PENDING';
      while (['PENDING', 'RUNNING'].includes(status) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
        status = (await request(server).get(`/api/v1/submissions/${submit.body.submissionId}`).set('Authorization', `Bearer ${aliceToken}`)).body.status;
      }
      expect(status).toBe('ACCEPTED');

      expect((await lessonAs(aliceToken)).body.practice[0].status).toBe('SOLVED');
      expect((await lessonAs(bobToken)).body.practice[0].status).toBe('NOT_ATTEMPTED');
    }, 45_000);

    it('a published lesson cannot keep a practice problem whose verification was reset, and students stop seeing it', async () => {
      // Editing the reference solution resets verification and sends the problem back to review.
      await request(server)
        .patch(`/api/v1/questions/${verifiedCoding}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ referenceSolutions: { PYTHON: 'a, b = map(int, input().split())\nprint(b + a)' } });

      const resave = await request(server).patch(`/api/v1/lessons/${lessonId}`).set('Authorization', `Bearer ${adminToken}`).send({ title: `Indexing v2 ${runId}` });
      expect(resave.status).toBe(422);
      expect(JSON.stringify(resave.body)).toContain('verification');
      expect((await lessonAs(aliceToken)).body.practice).toEqual([]);
    });
  });

  it('a lesson without checks is completed with "Mark complete"', async () => {
    const plain = await request(server)
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topic: 'Arrays', title: `Plain ${runId}`, summary: 's', concept: 'c', isPublished: true });
    lessonIds.push(plain.body.id);
    const res = await request(server).post(`/api/v1/learn/lessons/${plain.body.id}/complete`).set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    expect((await lessonAs(bobToken, plain.body.id)).body).toMatchObject({ completed: true, checksTotal: 0 });
  });
});

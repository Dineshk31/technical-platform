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
 * Requires a live execution-service (apps/execution-service) pointed at the same
 * DATABASE_URL, with EXECUTION_SERVICE_SHARED_SECRET matching apps/api's .env —
 * these tests actually compile/run real C++, Java, and Python programs. C++
 * requires CPP_COMPILER_PATH in apps/execution-service/.env to point at a real
 * g++ binary (this dev environment has no g++ on PATH — see
 * docs/architecture.md §0 — so the toolchain path is configured explicitly,
 * exactly the configurability docs/coding-engine.md §4 calls for).
 */
const PASSWORD = 'TestPass123!';
const runId = Date.now();
const POLL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 300;

describe('Run Code — public test case execution (e2e)', () => {
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
      data: { email: `run-e2e-admin-${runId}@test.local`, passwordHash, name: 'Run E2E Admin', roleId: adminRole.id },
    });
    const student = await prisma.user.create({
      data: { email: `run-e2e-student-${runId}@test.local`, passwordHash, name: 'Run E2E Student', roleId: studentRole.id },
    });
    const other = await prisma.user.create({
      data: { email: `run-e2e-other-${runId}@test.local`, passwordHash, name: 'Run E2E Other', roleId: studentRole.id },
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
        title: `Sum Two Numbers ${runId}-${Math.random().toString(36).slice(2)}`,
        problemStatement: 'Read two integers a and b from stdin (space separated) and print a + b.',
        inputFormat: 'Two space-separated integers.',
        outputFormat: 'A single integer.',
        constraints: [],
        examples: [{ input: '2 3', output: '5' }],
        difficulty: 'EASY',
        topics: ['Arrays'],
        marks: 10,
        timeLimitSeconds: 2,
        memoryLimitMb: 256,
        supportedLanguages: ['CPP', 'JAVA', 'PYTHON'],
        publicTestCases: [
          { input: '2 3', expectedOutput: '5' },
          { input: '10 20', expectedOutput: '30' },
        ],
        hiddenTestCases: [{ input: '100 200', expectedOutput: '300' }],
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

  async function createActiveAssessmentWith(questionId: string) {
    const now = Date.now();
    const create = await request(server)
      .post('/api/v1/assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Run Flow ${runId}-${Math.random().toString(36).slice(2)}`,
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
      .send({ questionId });
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
        return res.body;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`Submission ${submissionId} did not reach a terminal status within ${POLL_TIMEOUT_MS}ms`);
  }

  describe('Python', () => {
    let questionId: string;

    // Each test gets its own attempt (same question) rather than sharing one —
    // the per-(attempt, question) Run throttle (docs/security.md §7) would
    // otherwise make these tests flaky against each other purely from running
    // fast in sequence, which isn't what that test is for.
    let attemptId: string;

    beforeAll(async () => {
      questionId = await createQuestion();
    });

    beforeEach(async () => {
      const assessmentId = await createActiveAssessmentWith(questionId);
      attemptId = await startAttempt(assessmentId, studentToken);
    });

    it('accepts a correct solution against all public test cases', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'a, b = map(int, input().split())\nprint(a + b)' });
      expect(run.status).toBe(202);
      expect(run.body.submissionId).toBeTruthy();

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('ACCEPTED');
      expect(result.testsPassed).toBe(2);
      expect(result.testsTotal).toBe(2);
      expect(result.testCases).toHaveLength(2);
      for (const tc of result.testCases) {
        expect(tc.passed).toBe(true);
        expect(tc.isHidden).toBe(false);
        expect(tc.input).toBeTruthy();
        expect(tc.expectedOutput).toBeTruthy();
        expect(tc.actualOutput.trim()).toBe(tc.expectedOutput.trim());
      }
    }, 25_000);

    it('reports WRONG_ANSWER for an incorrect solution, with a mismatching actualOutput', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'a, b = map(int, input().split())\nprint(a - b)' });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('WRONG_ANSWER');
      expect(result.testsPassed).toBe(0);
      expect(result.testCases.every((tc: { passed: boolean }) => tc.passed === false)).toBe(true);
    }, 25_000);

    it('reports RUNTIME_ERROR for a syntax error, with a sanitized error message', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'def broken(:\n    pass' });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('RUNTIME_ERROR');
      expect(result.errorMessage).toBeTruthy();
      expect(result.errorMessage).not.toMatch(/[A-Za-z]:\\/); // no leaked absolute Windows path
      expect(result.errorMessage.length).toBeLessThan(4100);
    }, 25_000);

    it('reports TIME_LIMIT_EXCEEDED for an infinite loop', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'while True:\n    pass' });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('TIME_LIMIT_EXCEEDED');
    }, 25_000);
  });

  describe('Java', () => {
    let questionId: string;
    let attemptId: string;

    beforeAll(async () => {
      questionId = await createQuestion();
    });

    beforeEach(async () => {
      const assessmentId = await createActiveAssessmentWith(questionId);
      attemptId = await startAttempt(assessmentId, studentToken);
    });

    const CORRECT_JAVA = `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}`;

    it('accepts a correct solution', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'JAVA', code: CORRECT_JAVA });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('ACCEPTED');
      expect(result.testsPassed).toBe(2);
    }, 25_000);

    it('reports COMPILATION_ERROR for a syntax error', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'JAVA', code: 'public class Main { public static void main(String[] args) { int x = ; } }' });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('COMPILATION_ERROR');
      expect(result.errorMessage).toBeTruthy();
      expect(result.testCases).toHaveLength(0); // no test case is ever run after a compile failure
    }, 25_000);

    it('reports RUNTIME_ERROR for an uncaught exception', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          language: 'JAVA',
          code: `public class Main { public static void main(String[] args) { int[] a = new int[1]; System.out.println(a[5]); } }`,
        });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('RUNTIME_ERROR');
    }, 25_000);

    it('reports TIME_LIMIT_EXCEEDED for an infinite loop', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'JAVA', code: 'public class Main { public static void main(String[] args) { while (true) {} } }' });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('TIME_LIMIT_EXCEEDED');
    }, 25_000);
  });

  describe('security & validation', () => {
    let questionId: string;
    let assessmentId: string;
    let attemptId: string;

    beforeAll(async () => {
      questionId = await createQuestion();
      assessmentId = await createActiveAssessmentWith(questionId);
      attemptId = await startAttempt(assessmentId, studentToken);
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(401);
    });

    it("rejects another student running code against this attempt (404, ownership-checked)", async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(404);
    });

    it('rejects a question id not belonging to this assessment (404)', async () => {
      const foreignQuestion = await createQuestion();
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${foreignQuestion}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(404);
    });

    it('rejects a bogus attempt id (404)', async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/00000000-0000-0000-0000-000000000000/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(404);
    });

    it('rejects an unsupported language for this question (422)', async () => {
      const jsOnly = await createQuestion({ supportedLanguages: ['PYTHON'], referenceSolutions: { PYTHON: 'print(1)' } });
      const localAssessment = await createActiveAssessmentWith(jsOnly);
      const localAttempt = await startAttempt(localAssessment, studentToken);
      const res = await request(server)
        .post(`/api/v1/attempts/${localAttempt}/questions/${jsOnly}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'JAVA', code: 'public class Main {}' });
      expect(res.status).toBe(422);
    });

    it('rejects invalid input (400): bad language enum', async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'RUBY', code: 'print(1)' });
      expect(res.status).toBe(400);
    });

    it('rejects missing source code (400)', async () => {
      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: '' });
      expect(res.status).toBe(400);
    });

    it('throttles rapid repeated Run requests for the same question (429)', async () => {
      const first = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(first.status).toBe(202);

      const second = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(second.status).toBe(429);
    });

    it('rejects Run Code once the attempt is submitted (409)', async () => {
      const freshAssessment = await createActiveAssessmentWith(questionId);
      const freshAttempt = await startAttempt(freshAssessment, otherStudentToken);
      const submit = await request(server).post(`/api/v1/assessments/${freshAssessment}/submit`).set('Authorization', `Bearer ${otherStudentToken}`);
      expect(submit.status).toBe(201);

      const res = await request(server)
        .post(`/api/v1/attempts/${freshAttempt}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(res.status).toBe(409);
    });

    it('never returns a submission belonging to another student via GET /submissions/:id (404)', async () => {
      // Clears the per-(attempt, question) throttle from the "throttles rapid
      // repeated Run requests" test above, which shares this same attempt/question.
      await new Promise((resolve) => setTimeout(resolve, 2100));

      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'PYTHON', code: 'print(1)' });
      expect(run.status).toBe(202);

      const res = await request(server)
        .get(`/api/v1/submissions/${run.body.submissionId}`)
        .set('Authorization', `Bearer ${otherStudentToken}`);
      expect(res.status).toBe(404);
    }, 10_000);
  });

  describe('C++', () => {
    let questionId: string;
    let attemptId: string;

    beforeAll(async () => {
      questionId = await createQuestion();
    });

    beforeEach(async () => {
      const assessmentId = await createActiveAssessmentWith(questionId);
      attemptId = await startAttempt(assessmentId, studentToken);
    });

    const CORRECT_CPP = `#include <iostream>
int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b;
    return 0;
}`;

    it('accepts a correct solution', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'CPP', code: CORRECT_CPP });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('ACCEPTED');
      expect(result.testsPassed).toBe(2);
      expect(result.testsTotal).toBe(2);
      for (const tc of result.testCases) {
        expect(tc.passed).toBe(true);
        expect(tc.actualOutput?.trim()).toBe(tc.expectedOutput?.trim());
      }
    }, 25_000);

    it('reports WRONG_ANSWER for an incorrect solution', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          language: 'CPP',
          code: `#include <iostream>
int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a - b;
    return 0;
}`,
        });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('WRONG_ANSWER');
      expect(result.testsPassed).toBe(0);
      expect(result.testCases.every((tc: { passed: boolean }) => tc.passed === false)).toBe(true);
    }, 25_000);

    it('reports COMPILATION_ERROR for a syntax error, with no leaked server filesystem path', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'CPP', code: '#include <iostream>\nint main() { int x = ; }' });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('COMPILATION_ERROR');
      expect(result.errorMessage).toBeTruthy();
      expect(result.testCases).toHaveLength(0); // no test case is ever run after a compile failure
      // Never the real host temp path (e.g. C:\Users\...\AppData\Local\Temp\exec-<uuid>\...) —
      // only the sanitized <workspace>/<path> placeholders (docs/security.md §4).
      expect(result.errorMessage).not.toMatch(/[A-Za-z]:\\Users\\/);
      expect(result.errorMessage).not.toMatch(/AppData/);
    }, 25_000);

    it('reports RUNTIME_ERROR for a crashing program (division by zero)', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          language: 'CPP',
          code: `#include <iostream>
int main() {
    int a, b;
    std::cin >> a >> b;
    int zero = 0;
    std::cout << (a / zero);
    return 0;
}`,
        });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('RUNTIME_ERROR');
    }, 25_000);

    it('reports TIME_LIMIT_EXCEEDED for an infinite loop', async () => {
      const run = await request(server)
        .post(`/api/v1/attempts/${attemptId}/questions/${questionId}/run`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ language: 'CPP', code: '#include <iostream>\nint main() { while (true) {} return 0; }' });
      expect(run.status).toBe(202);

      const result = await pollSubmission(run.body.submissionId, studentToken);
      expect(result.status).toBe('TIME_LIMIT_EXCEEDED');
    }, 25_000);
  });
});

async function login(server: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

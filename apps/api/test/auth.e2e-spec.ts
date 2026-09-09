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

// Phase 13 — docs/security.md §1: per-account lockout after repeated failed login
// attempts, on top of role/ownership checks covered by the other e2e suites.
describe('Auth — login lockout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  let email: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const studentRole = await prisma.role.findUniqueOrThrow({ where: { code: 'STUDENT' } });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    email = `lockout-e2e-${runId}@test.local`;
    const user = await prisma.user.create({
      data: { email, passwordHash, name: 'Lockout E2E Student', roleId: studentRole.id },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('rejects wrong-password attempts with 401 and does not lock before the threshold', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await request(server).post('/api/v1/auth/login').send({ email, password: 'WrongPass!23' });
      expect(res.status).toBe(401);
    }
    // The 5th consecutive wrong attempt crosses MAX_FAILED_ATTEMPTS and locks the account —
    // even a correct password on this same attempt is still rejected (the check happens
    // before the bcrypt compare, per LocalIdentityProvider.validateCredentials).
    const lockingAttempt = await request(server).post('/api/v1/auth/login').send({ email, password: 'WrongPass!23' });
    expect(lockingAttempt.status).toBe(401);

    const stillLockedEvenWithCorrectPassword = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(stillLockedEvenWithCorrectPassword.status).toBe(429);
    expect(stillLockedEvenWithCorrectPassword.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('logs in successfully once the lock window has passed, and resets the failure count', async () => {
    // Simulate time passing rather than waiting the real 15 minutes.
    await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() - 1000) } });

    const res = await request(server).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.failedLoginAttempts).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });
});

import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('GET /api/v1/health reports ok when the database is reachable', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        if (res.body.status !== 'ok' || res.body.db !== 'connected') {
          throw new Error(`Unexpected health response: ${JSON.stringify(res.body)}`);
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.schema.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AssessmentsModule } from './modules/assessments/assessments.module.js';
import { QuestionsModule } from './modules/questions/questions.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';

@Module({
  imports: [
    // Default envFilePath (cwd-relative) resolves to apps/api/.env under every
    // invocation we use (`npm run start:dev -w @technical-platform/api`, `nest start`,
    // `node dist/main.js` from apps/api) — the same file the Prisma CLI reads by
    // default, so there is exactly one .env for the API to keep in sync.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AssessmentsModule,
    QuestionsModule,
    SubmissionsModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard establishes req.user first, RolesGuard then checks it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

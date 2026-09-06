import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/index.js';

/**
 * Prisma 7 requires a driver adapter for a direct database connection (no more
 * implicit `datasource.url` parsing — see prisma.config.ts for the CLI side of
 * this same change). This is also the seam that keeps the database layer
 * replaceable per docs/architecture.md: swapping Postgres drivers, or adding
 * connection pooling middleware, means changing this one constructor.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg(config.getOrThrow<string>('DATABASE_URL')) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL via Prisma');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

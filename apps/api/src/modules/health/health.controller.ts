import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let db: 'connected' | 'error' = 'connected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    return {
      status: db === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db,
    };
  }
}

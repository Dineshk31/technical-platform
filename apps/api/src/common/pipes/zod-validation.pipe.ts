import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * The single validation mechanism for the API (docs/architecture.md — Zod
 * everywhere, no class-validator). Used per-route via
 * `@UsePipes(new ZodValidationPipe(SomeSchema))`. Rejected requests never
 * reach a service method.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.') || undefined,
            issue: issue.message,
          })),
        },
      });
    }
    return result.data;
  }
}

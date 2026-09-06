import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({ email: z.string().email(), age: z.number().min(18) });
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value when input is valid', () => {
    const result = pipe.transform({ email: 'student@centurion.test', age: 20 });
    expect(result).toEqual({ email: 'student@centurion.test', age: 20 });
  });

  it('throws a BadRequestException with a field-level detail when input is invalid', () => {
    try {
      pipe.transform({ email: 'not-an-email', age: 10 });
      expect.unreachable('transform should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        error: { code: string; details: { field: string }[] };
      };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['email', 'age']));
    }
  });
});

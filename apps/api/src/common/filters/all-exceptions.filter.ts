import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@technical-platform/shared';
import { Prisma } from '../../../generated/prisma/index.js';

/**
 * The single place every thrown error is turned into the response envelope
 * documented in docs/api-specification.md §1: { error: { code, message, details? } }.
 * A pipe/service can throw a plain HttpException (mapped generically below)
 * or one already carrying an `error` payload (e.g. ZodValidationPipe) — the
 * latter is passed through untouched.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = this.statusFor(exception);
    const body = this.buildBody(exception, status);

    response.status(status).json(body);
  }

  /**
   * A malformed :id path param (e.g. `GET /questions/not-a-uuid`) reaches Prisma
   * directly — every controller passes `@Param('id')` straight into a query against a
   * `@db.Uuid` column with no upstream format check (docs/security.md §6 calls for
   * every param to be validated; this is the centralized backstop for that one gap
   * rather than adding a UUID pipe to every route). Without this, that's a client
   * input-format error but was surfacing as a generic 500 via the catch-all branch
   * below. Prisma reports it as either a client-side validation error (bad argument
   * shape/type) or a known request error from the driver (P2007/P2023) depending on
   * where the check happens — all three mean the same thing to the caller: bad input,
   * not a server fault.
   */
  private statusFor(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (exception instanceof Prisma.PrismaClientValidationError) return HttpStatus.BAD_REQUEST;
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2007 ("Data validation error", e.g. "invalid input syntax for type uuid" from
      // the pg adapter) and P2023 ("Inconsistent column data") both mean a malformed
      // input value reached the query — a client error, not a server fault.
      if (exception.code === 'P2007' || exception.code === 'P2023') return HttpStatus.BAD_REQUEST;
      if (exception.code === 'P2025') return HttpStatus.NOT_FOUND;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildBody(exception: unknown, status: number): ApiErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      // Nest's default HttpException body is { statusCode, message, error: 'Unauthorized' } —
      // note `error` is a *string* there. Only treat the payload as an already-built
      // ApiErrorBody (e.g. from ZodValidationPipe) when `error` is itself an object;
      // otherwise fall through and build the envelope below.
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof (payload as { error: unknown }).error === 'object'
      ) {
        return payload as ApiErrorBody;
      }
      const rawMessage =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] })?.message ?? exception.message);
      const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage;
      return { error: { code: codeForStatus(status), message } };
    }

    if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.NOT_FOUND) {
      // A malformed-id Prisma error (see statusFor) — a genuine client input problem,
      // not a server fault, so it doesn't get the generic 500 message/log-as-unhandled
      // treatment below. Still logged at debug-ish level implicitly by Nest's own
      // request logging; nothing internal (query text, column names) is echoed to the client.
      return {
        error: {
          code: codeForStatus(status),
          message: status === HttpStatus.NOT_FOUND ? 'Resource not found' : 'Invalid request',
        },
      };
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    return { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } };
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}

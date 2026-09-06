import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@technical-platform/shared';

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

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.buildBody(exception, status);

    response.status(status).json(body);
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

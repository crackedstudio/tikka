import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { FastifyReply, FastifyRequest } from 'fastify';

export interface ErrorResponse {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}

/**
 * Global exception filter that catches all errors and returns a consistent
 * JSON shape: { statusCode, message, timestamp, path }.
 *
 * - HttpException subclasses (BadRequestException, NotFoundException, etc.)
 *   use their own status code and message.
 * - Unknown/unexpected errors are mapped to 500 Internal Server Error.
 *   The original error is logged but not exposed to the client.
 */
@Catch()
export class BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BaseExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const { statusCode, message } = this.resolveError(exception);

    const body: ErrorResponse = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    reply.status(statusCode).send(body);
  }

  private resolveError(exception: unknown): { statusCode: number; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      const message =
        typeof response === 'string'
          ? response
          : typeof (response as Record<string, unknown>).message === 'string'
            ? (response as Record<string, unknown>).message as string
            : exception.message;

      return { statusCode: status, message };
    }

    // Unexpected error — log full details, return generic 500
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    Sentry.captureException(exception);

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}

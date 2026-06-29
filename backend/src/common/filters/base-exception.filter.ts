import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import { REQUEST_ID_HEADER } from '../../middleware/request-id.middleware';

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
  'x-request-id'?: string;
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
    const requestId = this.getRequestId(request);

    const { statusCode, error, message } = this.resolveError(exception);

    const body: ErrorResponse = {
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (requestId) {
      body[REQUEST_ID_HEADER] = requestId;
    }

    reply.status(statusCode).send(body);
  }

  private resolveError(
    exception: unknown,
  ): { statusCode: number; error: string; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const error = this.getHttpStatusLabel(status);

      if (typeof response === 'string') {
        return { statusCode: status, error, message: response };
      }

      const responseObject = response as Record<string, unknown>;
      const message = this.normalizeMessage(responseObject.message, exception.message);
      const resolvedError =
        typeof responseObject.error === 'string' && responseObject.error.trim().length > 0
          ? responseObject.error
          : error;

      return { statusCode: status, error: resolvedError, message };
    }

    // Unexpected error — log full details, return generic 500
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    Sentry.captureException(exception);

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: this.getHttpStatusLabel(HttpStatus.INTERNAL_SERVER_ERROR),
      message: 'Internal server error',
    };
  }

  private getRequestId(request: FastifyRequest): string | undefined {
    const header = request.headers?.[REQUEST_ID_HEADER];

    if (Array.isArray(header)) {
      return header[0];
    }

    return typeof header === 'string' && header.trim().length > 0 ? header : undefined;
  }

  private normalizeMessage(message: unknown, fallback: string): string {
    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message)) {
      return message
        .map((entry) => (typeof entry === 'string' ? entry : String(entry)))
        .join(', ');
    }

    return fallback;
  }

  private getHttpStatusLabel(statusCode: number): string {
    const label = HttpStatus[statusCode];

    if (typeof label !== 'string') {
      return 'Error';
    }

    return label
      .toLowerCase()
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }
}

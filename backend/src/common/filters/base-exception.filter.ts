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

export const REQUEST_ID_HEADER = 'x-request-id';

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SUPABASE_ERROR: 'SUPABASE_ERROR',
  STELLAR_ERROR: 'STELLAR_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  error: ErrorCode;
  requestId?: string;
  timestamp: string;
  path: string;
  details?: unknown;
}

interface ResolvedError {
  statusCode: number;
  message: string;
  error: ErrorCode;
  details?: unknown;
}

@Catch()
export class BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BaseExceptionFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = this.getRequestId(request);

    const { statusCode, message, error, details } = this.resolveError(exception);

    const body: ApiErrorResponse = {
      statusCode,
      error,
      message,
      error,
      requestId: request.headers?.[REQUEST_ID_HEADER] as string | undefined,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (details !== undefined) {
      body.details = details;
    }

    reply.status(statusCode).send(body);
  }

  private resolveError(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    const supabase = this.tryResolveSupabaseError(exception);
    if (supabase) return supabase;

    const stellar = this.tryResolveStellarError(exception);
    if (stellar) return stellar;

    return this.resolveUnknownError(exception);
  }

  private resolveHttpException(exception: HttpException): ResolvedError {
    const status = exception.getStatus();
    const response = exception.getResponse();

    const rawMessage: unknown =
      typeof response === 'string'
        ? response
        : (response as Record<string, unknown>).message;

    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : Array.isArray(rawMessage)
          ? rawMessage.join('; ')
          : exception.message;

    const rawErrors =
      typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>).errors
        : undefined;

    const details: unknown[] | undefined = Array.isArray(rawErrors) && rawErrors.length > 0
      ? rawErrors
      : undefined;

    const error = this.mapHttpStatusToErrorCode(status, details);

    return {
      statusCode: status,
      message,
      error,
      details,
    };
  }

  private mapHttpStatusToErrorCode(
    status: number,
    details?: unknown[],
  ): ErrorCode {
    if (details) return ErrorCode.VALIDATION_ERROR;

    switch (status) {
      case 400:
        return ErrorCode.BAD_REQUEST;
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 429:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      case 503:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
    }
  }

  private tryResolveSupabaseError(exception: unknown): ResolvedError | null {
    if (
      typeof exception !== 'object' ||
      exception === null ||
      exception instanceof HttpException ||
      exception instanceof Error === false
    ) {
      return null;
    }

    const err = exception as unknown as Record<string, unknown>;

    if (
      typeof err.code === 'string' &&
      typeof err.message === 'string' &&
      typeof err.details === 'string'
    ) {
      this.logger.error('Supabase error', err);

      if (!this.isProd) {
        Sentry.captureException(exception);
      }

      return {
        statusCode: HttpStatus.BAD_GATEWAY,
        message: err.message as string,
        error: ErrorCode.SUPABASE_ERROR,
        details: {
          code: err.code,
          hint: err.hint,
        },
      };
    }

    return null;
  }

  private tryResolveStellarError(exception: unknown): ResolvedError | null {
    if (
      typeof exception !== 'object' ||
      exception === null ||
      exception instanceof HttpException ||
      exception instanceof Error === false
    ) {
      return null;
    }

    const err = exception as unknown as Record<string, unknown>;

    if (err.response !== undefined && typeof err.response === 'object' && err.response !== null) {
      const resp = err.response as Record<string, unknown>;
      const status = typeof resp.status === 'number' ? resp.status : HttpStatus.BAD_GATEWAY;
      const message = typeof resp.data === 'object' && resp.data !== null
        ? ((resp.data as Record<string, unknown>).detail as string) ??
          ((resp.data as Record<string, unknown>).message as string) ??
          (err.message as string) ??
          'Stellar request failed'
        : (err.message as string) ?? 'Stellar request failed';

      this.logger.error('Stellar error', err);

      if (!this.isProd) {
        Sentry.captureException(exception);
      }

      return {
        statusCode: status,
        message: typeof message === 'string' ? message : 'Stellar request failed',
        error: ErrorCode.STELLAR_ERROR,
        details: { response: resp.data ?? resp },
      };
    }

    return null;
  }

  private resolveUnknownError(exception: unknown): ResolvedError {
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    Sentry.captureException(exception);

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: this.getHttpStatusLabel(HttpStatus.INTERNAL_SERVER_ERROR),
      message: 'Internal server error',
      error: ErrorCode.INTERNAL_ERROR,
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

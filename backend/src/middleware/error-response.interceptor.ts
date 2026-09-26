import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { REQUEST_ID_HEADER } from './request-id.middleware';

/**
 * Attaches the request ID to the error's response object so downstream
 * handlers (e.g. BaseExceptionFilter) can echo it back to the caller.
 *
 * IMPORTANT: this interceptor must NOT set error messages from raw
 * exception objects onto the response — that would bypass the filter's
 * production redaction. Only the requestId is injected here.
 */
@Injectable()
export class ErrorResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers?.[REQUEST_ID_HEADER] as string | undefined;

    return next.handle().pipe(
      catchError((error) => {
        // Only attach the request ID to an existing structured response.
        // Never fabricate a response.message from error.message — that
        // would leak internal detail before BaseExceptionFilter can redact it.
        if (error.response && typeof error.response === 'object') {
          error.response.requestId = requestId;
        }

        return throwError(() => error);
      }),
    );
  }
}

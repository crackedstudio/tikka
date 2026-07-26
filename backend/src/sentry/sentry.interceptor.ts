import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as Sentry from '@sentry/nestjs';
import { FastifyRequest, FastifyReply } from 'fastify';
import { setSentryRequestContext } from './sentry';

type AuthenticatedRequest = FastifyRequest & {
  user?: { address?: string };
};

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<FastifyReply>();

    return next.handle().pipe(
      catchError((error) => {
        Sentry.withScope((scope) => {
          setSentryRequestContext(scope, {
            requestId: this.resolveRequestId(request),
            route: this.resolveRoute(context),
            statusCode: response.statusCode,
            walletAddress: request.user?.address,
          });
          scope.setExtra('error_class', (error as Error)?.constructor?.name ?? 'UnknownError');
          Sentry.captureException(error);
        });
        return throwError(() => error);
      }),
    );
  }

  private resolveRequestId(request: AuthenticatedRequest): string | null {
    // Prefer an explicit x-request-id header set by a gateway/proxy
    const header = request.headers?.['x-request-id'];
    if (header) return Array.isArray(header) ? header[0] : header;
    // Fastify assigns an incremental id to every request
    return request.id ? String(request.id) : null;
  }

  private resolveRoute(context: ExecutionContext): string | null {
    // Reflect metadata set by NestJS route decorators gives us the pattern
    const handler = context.getHandler();
    const controller = context.getClass();
    const controllerPath: string = Reflect.getMetadata('path', controller) ?? '';
    const handlerPath: string = Reflect.getMetadata('path', handler) ?? '';
    const route = `/${controllerPath}/${handlerPath}`.replace(/\/+/g, '/');
    return route !== '/' ? route : null;
  }
}

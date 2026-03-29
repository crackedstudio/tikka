import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';

interface HttpRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
}

interface HttpResponseLike {
  statusCode?: number;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const response = context.switchToHttp().getResponse<HttpResponseLike>();
    const startedAt = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const method = request.method ?? 'UNKNOWN';
        const url = this.sanitizeUrl(request.originalUrl ?? request.url);
        const statusCode = response.statusCode ?? 500;
        const durationMs = Date.now() - startedAt;

        this.logger.log(`${method} ${url} ${statusCode} ${durationMs}ms`);
      }),
    );
  }

  private sanitizeUrl(url: string | undefined): string {
    if (!url) {
      return 'UNKNOWN';
    }

    return url.split('?')[0] || '/';
  }
}

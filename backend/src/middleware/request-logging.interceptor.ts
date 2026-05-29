import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';

const DEFAULT_REDACT_FIELDS = [
  'authorization',
  'token',
  'privatekey',
  'secret',
  'password',
  'x-api-key',
];

function getRedactFields(): string[] {
  const env = process.env.LOG_REDACT_FIELDS;
  if (env) {
    return env.split(',').map((f) => f.trim().toLowerCase());
  }
  return DEFAULT_REDACT_FIELDS;
}

export function redact(obj: unknown, fields: string[]): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, fields));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (fields.includes(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redact(value, fields);
      }
    }
    return result;
  }

  return obj;
}

interface HttpRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, unknown>;
  body?: unknown;
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

        const redactFields = getRedactFields();
        const safeHeaders = redact(request.headers ?? {}, redactFields);
        const safeBody = redact(request.body, redactFields);

        this.logger.log(`${method} ${url} ${statusCode} ${durationMs}ms`, {
          headers: safeHeaders,
          body: safeBody,
        });
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

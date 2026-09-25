import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, switchMap, tap } from 'rxjs';
import { IdempotencyService } from './idempotency.service';
import { SKIP_IDEMPOTENCY_KEY } from './skip-idempotency.decorator';

interface AuthenticatedRequest {
  method?: string;
  headers: Record<string, string | undefined>;
  user?: { address?: string };
  ip?: string;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = (req.method ?? 'GET').toUpperCase();

    // 1. Non-mutating methods (GET, HEAD, OPTIONS) do not require idempotency
    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    // 2. Check if route/controller explicitly opted out via @SkipIdempotency()
    const skipIdempotency = this.reflector.getAllAndOverride<boolean>(
      SKIP_IDEMPOTENCY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipIdempotency) {
      return next.handle();
    }

    const idempotencyKey = req.headers['idempotency-key'];
    const walletAddress = req.user?.address || req.headers['x-admin-id'] || 'anon';

    // 3. Mutating methods are idempotent by default — require Idempotency-Key header
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required for mutating requests.');
    }

    return from(this.idempotency.get(walletAddress, idempotencyKey)).pipe(
      switchMap((existing) => {
        if (existing?.status === 'in-flight') {
          throw new ConflictException(
            'A request with this Idempotency-Key is already in progress.',
          );
        }

        if (existing?.status === 'done') {
          return from([existing.response]);
        }

        return from(this.idempotency.lock(walletAddress, idempotencyKey)).pipe(
          switchMap((locked) => {
            if (!locked) {
              // Race: another request just acquired the lock
              throw new ConflictException(
                'A request with this Idempotency-Key is already in progress.',
              );
            }

            return next.handle().pipe(
              tap({
                next: (response) =>
                  this.idempotency.resolve(walletAddress, idempotencyKey, response),
              }),
            );
          }),
        );
      }),
    );
  }
}

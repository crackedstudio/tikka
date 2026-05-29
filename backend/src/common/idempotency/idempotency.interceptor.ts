import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap, tap } from 'rxjs';
import { IdempotencyService } from './idempotency.service';

interface AuthenticatedRequest {
  headers: Record<string, string | undefined>;
  user?: { address?: string };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const idempotencyKey = req.headers['idempotency-key'];
    const walletAddress = req.user?.address;

    if (!idempotencyKey || !walletAddress) {
      return next.handle();
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

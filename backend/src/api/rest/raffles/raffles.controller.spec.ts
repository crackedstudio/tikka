import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

describe('IdempotencyInterceptor — upsertMetadata idempotency', () => {
  let interceptor: IdempotencyInterceptor;
  let idempotencyService: {
    get: jest.Mock;
    lock: jest.Mock;
    resolve: jest.Mock;
  };

  beforeEach(() => {
    idempotencyService = {
      get: jest.fn().mockResolvedValue(null),
      lock: jest.fn().mockResolvedValue(true),
      resolve: jest.fn().mockResolvedValue(undefined),
    };

    interceptor = new IdempotencyInterceptor(idempotencyService as any);
  });

  function createMockContext(idempotencyKey?: string, walletAddress = 'GABC123') {
    const req = {
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      user: { address: walletAddress },
    };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it('processes the first request and caches the response', (done) => {
    const ctx = createMockContext('key-1');
    const handler = { handle: () => of({ raffleId: 42, title: 'Test Raffle' }) };

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual({ raffleId: 42, title: 'Test Raffle' });
        expect(idempotencyService.get).toHaveBeenCalledWith('GABC123', 'key-1');
        expect(idempotencyService.lock).toHaveBeenCalledWith('GABC123', 'key-1');
        expect(idempotencyService.resolve).toHaveBeenCalledWith('GABC123', 'key-1', { raffleId: 42, title: 'Test Raffle' });
        done();
      },
    });
  });

  it('returns cached response for duplicate request with same Idempotency-Key', (done) => {
    const cachedResponse = { raffleId: 42, title: 'Test Raffle' };
    idempotencyService.get.mockResolvedValueOnce({ status: 'done', response: cachedResponse });

    const ctx = createMockContext('key-1');
    const handler = { handle: jest.fn().mockReturnValue(of({ raffleId: 42 })) };

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual(cachedResponse);
        expect(handler.handle).not.toHaveBeenCalled();
        expect(idempotencyService.lock).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('does not call service method twice for same Idempotency-Key', (done) => {
    const cachedResponse = { raffleId: 42, title: 'Test Raffle' };
    idempotencyService.get.mockResolvedValueOnce({ status: 'done', response: cachedResponse });

    const ctx = createMockContext('key-1');
    const handler = { handle: jest.fn() };

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual(cachedResponse);
        expect(handler.handle).not.toHaveBeenCalled();
        done();
      },
    });
  });
});

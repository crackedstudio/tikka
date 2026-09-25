import { BadRequestException, ConflictException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, firstValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';
import { SKIP_IDEMPOTENCY_KEY } from './skip-idempotency.decorator';

function buildService(overrides: Partial<IdempotencyService> = {}): IdempotencyService {
  return {
    get: jest.fn().mockResolvedValue(null),
    lock: jest.fn().mockResolvedValue(true),
    resolve: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IdempotencyService;
}

function buildReflector(skip: boolean = false): Reflector {
  return {
    getAllAndOverride: jest.fn().mockImplementation((key: string) => {
      if (key === SKIP_IDEMPOTENCY_KEY) return skip;
      return undefined;
    }),
  } as unknown as Reflector;
}

function buildContext(
  headers: Record<string, string | undefined> = {},
  user?: { address?: string },
  method: string = 'POST',
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ headers, user, method }),
    }),
  } as unknown as ExecutionContext;
}

function buildHandler(response: unknown = { ok: true }) {
  const handlerFn = jest.fn().mockReturnValue(of(response));
  return { handle: handlerFn };
}

describe('IdempotencyInterceptor (Default Mutating Enforcement)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('happy path', () => {
    it('processes mutating request with Idempotency-Key, locks, and resolves response', async () => {
      const svc = buildService();
      const reflector = buildReflector(false);
      const interceptor = new IdempotencyInterceptor(svc, reflector);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, { address: 'GABC123' }, 'POST');
      const handler = buildHandler({ raffleId: 42 });

      const result = await firstValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual({ raffleId: 42 });
      expect(handler.handle).toHaveBeenCalledTimes(1);
      expect(svc.lock).toHaveBeenCalledWith('GABC123', 'key-001');
      expect(svc.resolve).toHaveBeenCalledWith('GABC123', 'key-001', { raffleId: 42 });
    });
  });

  describe('replayed request (no second effect)', () => {
    it('returns the identical cached response on duplicate request without calling handler a second time', async () => {
      const cachedResponse = { raffleId: 42, status: 'created' };
      const svc = buildService({
        get: jest.fn().mockResolvedValue({ status: 'done', response: cachedResponse }),
      });
      const reflector = buildReflector(false);
      const interceptor = new IdempotencyInterceptor(svc, reflector);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, { address: 'GABC123' }, 'POST');
      const handler = buildHandler();

      const result = await firstValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual(cachedResponse);
      expect(handler.handle).not.toHaveBeenCalled();
      expect(svc.lock).not.toHaveBeenCalled();
    });
  });

  describe('missing header enforcement on mutating routes', () => {
    it('throws BadRequestException when mutating request is missing Idempotency-Key header', async () => {
      const svc = buildService();
      const reflector = buildReflector(false);
      const interceptor = new IdempotencyInterceptor(svc, reflector);
      const ctx = buildContext({}, { address: 'GABC123' }, 'POST');
      const handler = buildHandler();

      expect(() => interceptor.intercept(ctx, handler)).toThrow(BadRequestException);
      expect(handler.handle).not.toHaveBeenCalled();
    });
  });

  describe('opt-out via @SkipIdempotency()', () => {
    it('skips idempotency enforcement and allows mutating request without Idempotency-Key if @SkipIdempotency is set', async () => {
      const svc = buildService();
      const reflector = buildReflector(true);
      const interceptor = new IdempotencyInterceptor(svc, reflector);
      const ctx = buildContext({}, { address: 'GABC123' }, 'POST');
      const handler = buildHandler({ skipped: true });

      const result = await firstValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual({ skipped: true });
      expect(handler.handle).toHaveBeenCalledTimes(1);
      expect(svc.get).not.toHaveBeenCalled();
    });
  });

  describe('non-mutating methods (GET, HEAD, OPTIONS)', () => {
    it('automatically skips idempotency checks on GET requests without header', async () => {
      const svc = buildService();
      const reflector = buildReflector(false);
      const interceptor = new IdempotencyInterceptor(svc, reflector);
      const ctx = buildContext({}, undefined, 'GET');
      const handler = buildHandler({ items: [] });

      const result = await firstValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual({ items: [] });
      expect(handler.handle).toHaveBeenCalledTimes(1);
      expect(svc.get).not.toHaveBeenCalled();
    });
  });

  describe('in-flight request locking', () => {
    it('throws ConflictException (409) when key is already in-flight', async () => {
      const svc = buildService({
        get: jest.fn().mockResolvedValue({ status: 'in-flight' }),
      });
      const reflector = buildReflector(false);
      const interceptor = new IdempotencyInterceptor(svc, reflector);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, { address: 'GABC123' }, 'POST');
      const handler = buildHandler();

      await expect(firstValueFrom(interceptor.intercept(ctx, handler))).rejects.toThrow(
        ConflictException,
      );
      expect(handler.handle).not.toHaveBeenCalled();
    });
  });
});

import { ConflictException, ExecutionContext } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildService(overrides: Partial<IdempotencyService> = {}): IdempotencyService {
  return {
    get: jest.fn().mockResolvedValue(null),
    lock: jest.fn().mockResolvedValue(true),
    resolve: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IdempotencyService;
}

function buildContext(
  headers: Record<string, string | undefined> = {},
  user?: { address?: string },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, user }),
    }),
  } as unknown as ExecutionContext;
}

function buildHandler(response: unknown = { ok: true }) {
  return { handle: () => of(response) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('IdempotencyInterceptor', () => {
  afterEach(() => jest.clearAllMocks());

  describe('happy path', () => {
    it('processes the request, caches the response, and returns it', async () => {
      const svc = buildService();
      const interceptor = new IdempotencyInterceptor(svc);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, { address: 'GABC123' });

      const result = await firstValueFrom(interceptor.intercept(ctx, buildHandler()));

      expect(result).toEqual({ ok: true });
      expect(svc.lock).toHaveBeenCalledWith('GABC123', 'key-001');
      expect(svc.resolve).toHaveBeenCalledWith('GABC123', 'key-001', { ok: true });
    });
  });

  describe('duplicate path', () => {
    it('returns the cached response without re-processing', async () => {
      const cached = { ok: true, txHash: 'abc123' };
      const svc = buildService({
        get: jest.fn().mockResolvedValue({ status: 'done', response: cached }),
      });
      const interceptor = new IdempotencyInterceptor(svc);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, { address: 'GABC123' });

      const result = await firstValueFrom(interceptor.intercept(ctx, buildHandler()));

      expect(result).toEqual(cached);
      expect(svc.lock).not.toHaveBeenCalled();
      expect(svc.resolve).not.toHaveBeenCalled();
    });
  });

  describe('in-flight path', () => {
    it('throws 409 when the key is already in-flight', async () => {
      const svc = buildService({
        get: jest.fn().mockResolvedValue({ status: 'in-flight' }),
      });
      const interceptor = new IdempotencyInterceptor(svc);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, { address: 'GABC123' });

      await expect(firstValueFrom(interceptor.intercept(ctx, buildHandler()))).rejects.toThrow(
        ConflictException,
      );
      expect(svc.lock).not.toHaveBeenCalled();
    });

    it('throws 409 when the lock is lost in a race (SET NX returns false)', async () => {
      const svc = buildService({
        get: jest.fn().mockResolvedValue(null),
        lock: jest.fn().mockResolvedValue(false),
      });
      const interceptor = new IdempotencyInterceptor(svc);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, { address: 'GABC123' });

      await expect(firstValueFrom(interceptor.intercept(ctx, buildHandler()))).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('passthrough', () => {
    it('skips idempotency when no Idempotency-Key header is present', async () => {
      const svc = buildService();
      const interceptor = new IdempotencyInterceptor(svc);
      const ctx = buildContext({}, { address: 'GABC123' });

      const result = await firstValueFrom(interceptor.intercept(ctx, buildHandler()));

      expect(result).toEqual({ ok: true });
      expect(svc.get).not.toHaveBeenCalled();
      expect(svc.lock).not.toHaveBeenCalled();
    });

    it('skips idempotency when user is not authenticated', async () => {
      const svc = buildService();
      const interceptor = new IdempotencyInterceptor(svc);
      const ctx = buildContext({ 'idempotency-key': 'key-001' }, undefined);

      const result = await firstValueFrom(interceptor.intercept(ctx, buildHandler()));

      expect(result).toEqual({ ok: true });
      expect(svc.get).not.toHaveBeenCalled();
    });
  });
});

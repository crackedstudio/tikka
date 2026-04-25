/**
 * Property-based tests for authService
 * Feature: siws-auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getNonce, verify } from './authService';

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  });
}

function mockFetchError(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchErrorBadJson(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.reject(new SyntaxError('bad json')),
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── P1: getNonce URL formation ────────────────────────────────────────────────

describe('P1: getNonce URL formation', () => {
  // Feature: siws-auth, Property 1: For any valid Stellar address string, getNonce(address)
  // must construct a GET request to /auth/nonce with the address URL-encoded as the
  // address query parameter, and return an object with nonce, expiresAt, issuedAt, message.
  it('constructs correct URL with encoded address and returns NonceResponse shape', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (address) => {
        const nonceResponse = {
          nonce: 'abc123',
          expiresAt: '2099-01-01T00:00:00Z',
          issuedAt: '2024-01-01T00:00:00Z',
          message: 'Sign this message',
        };
        const fetchMock = mockFetchOk(nonceResponse);
        vi.stubGlobal('fetch', fetchMock);

        const result = await getNonce(address);

        // Verify URL contains encoded address
        const calledUrl: string = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/auth/nonce');
        expect(calledUrl).toContain(`address=${encodeURIComponent(address)}`);

        // Verify response shape
        expect(result).toHaveProperty('nonce');
        expect(result).toHaveProperty('expiresAt');
        expect(result).toHaveProperty('issuedAt');
        expect(result).toHaveProperty('message');
      }),
      { numRuns: 100 },
    );
  });
});

// ── P2: Auth service error propagation ───────────────────────────────────────

describe('P2: Auth service error propagation', () => {
  // Feature: siws-auth, Property 2: For any non-2xx HTTP response from /auth/nonce or
  // /auth/verify, the service function must throw an Error whose message equals the
  // message field from the response body, or the fallback string when body cannot be parsed.
  it('getNonce throws Error with body.message on non-2xx', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.option(fc.string({ minLength: 1 })),
        async (status, maybeMessage) => {
          const body = maybeMessage !== null ? { message: maybeMessage } : { message: 'Failed to get nonce' };
          vi.stubGlobal('fetch', mockFetchError(status, body));

          await expect(getNonce('GTEST')).rejects.toThrow(
            maybeMessage !== null ? maybeMessage : 'Failed to get nonce',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getNonce throws fallback message when body cannot be parsed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        async (status) => {
          vi.stubGlobal('fetch', mockFetchErrorBadJson(status));
          await expect(getNonce('GTEST')).rejects.toThrow('Failed to get nonce');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('verify throws Error with body.message on non-2xx', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.option(fc.string({ minLength: 1 })),
        async (status, maybeMessage) => {
          const body = maybeMessage !== null ? { message: maybeMessage } : { message: 'Verification failed' };
          vi.stubGlobal('fetch', mockFetchError(status, body));

          await expect(
            verify({ address: 'GTEST', signature: 'sig', nonce: 'nonce' }),
          ).rejects.toThrow(maybeMessage !== null ? maybeMessage : 'Verification failed');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('verify throws fallback message when body cannot be parsed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        async (status) => {
          vi.stubGlobal('fetch', mockFetchErrorBadJson(status));
          await expect(
            verify({ address: 'GTEST', signature: 'sig', nonce: 'nonce' }),
          ).rejects.toThrow('Verification failed');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P3: verify sends correct body ────────────────────────────────────────────

describe('P3: verify sends correct body', () => {
  // Feature: siws-auth, Property 3: For any verify request { address, signature, nonce, issuedAt },
  // calling authService.verify(request) must issue a POST to /auth/verify with a JSON body
  // containing exactly those four fields, and return the accessToken from a successful response.
  it('sends POST to /auth/verify with correct JSON body and returns accessToken', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          address: fc.string(),
          signature: fc.string(),
          nonce: fc.string(),
          issuedAt: fc.string(),
        }),
        async (request) => {
          const accessToken = 'jwt-token-xyz';
          const fetchMock = mockFetchOk({ accessToken });
          vi.stubGlobal('fetch', fetchMock);

          const result = await verify(request);

          // Verify method is POST
          const fetchOptions = fetchMock.mock.calls[0][1] as RequestInit;
          expect(fetchOptions.method).toBe('POST');

          // Verify URL contains /auth/verify
          const calledUrl: string = fetchMock.mock.calls[0][0] as string;
          expect(calledUrl).toContain('/auth/verify');

          // Verify body contains all four fields
          const body = JSON.parse(fetchOptions.body as string);
          expect(body.address).toBe(request.address);
          expect(body.signature).toBe(request.signature);
          expect(body.nonce).toBe(request.nonce);
          expect(body.issuedAt).toBe(request.issuedAt);

          // Verify return value
          expect(result.accessToken).toBe(accessToken);
        },
      ),
      { numRuns: 100 },
    );
  });
});

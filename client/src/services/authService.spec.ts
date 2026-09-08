/**
 * Property-based tests for authService
 * Feature: siws-auth
 *
 * The real `fetch` calls in authService now hit the shared MSW server. Request
 * URLs, methods and bodies are asserted by capturing the intercepted Request
 * inside the handler, so nothing stubs `global.fetch` directly.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { http, HttpResponse } from 'msw';
import { getNonce, verify } from './authService';
import { server } from '../test/server';
import { API_BASE_URL } from '../test/handlers';

interface CapturedRequest {
  url: string;
  method: string;
  body?: unknown;
}

let captured: CapturedRequest | null = null;

beforeEach(() => {
  captured = null;
});

afterEach(() => {
  captured = null;
});

// ── P1: getNonce URL formation ──────────────────────────────────────────────────

describe('P1: getNonce URL formation', () => {
  it('constructs correct URL with encoded address and returns NonceResponse shape', async () => {
    server.use(
      http.get(`${API_BASE_URL}/auth/nonce`, async ({ request }) => {
        captured = { url: request.url, method: request.method };
        return HttpResponse.json({
          nonce: 'abc123',
          expiresAt: '2099-01-01T00:00:00Z',
          issuedAt: '2024-01-01T00:00:00Z',
          message: 'Sign this message',
        });
      })
    );

    await fc.assert(
      fc.asyncProperty(fc.string(), async (address) => {
        const result = await getNonce(address);

        expect(captured).not.toBeNull();
        expect(captured!.url).toContain('/auth/nonce');
        const url = new URL(captured!.url);
        expect(url.searchParams.get('address')).toBe(address);

        expect(result).toHaveProperty('nonce');
        expect(result).toHaveProperty('expiresAt');
        expect(result).toHaveProperty('issuedAt');
        expect(result).toHaveProperty('message');
      }),
      { numRuns: 100 }
    );
  });
});

// ── P2: Auth service error propagation ──────────────────────────────────────────

describe('P2: Auth service error propagation', () => {
  it('getNonce throws Error with body.message on non-2xx', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.option(fc.string({ minLength: 1 })),
        async (status, maybeMessage) => {
          const body =
            maybeMessage !== null
              ? { message: maybeMessage }
              : { message: 'Failed to get nonce' };
          server.use(
            http.get(`${API_BASE_URL}/auth/nonce`, () => HttpResponse.json(body, { status }))
          );

          await expect(getNonce('GTEST')).rejects.toThrow(
            maybeMessage !== null ? maybeMessage : 'Failed to get nonce'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getNonce throws fallback message when body cannot be parsed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 400, max: 599 }), async (status) => {
        server.use(
          http.get(
            `${API_BASE_URL}/auth/nonce`,
            () =>
              new HttpResponse('not json', {
                status,
                headers: { 'content-type': 'text/plain' },
              })
          )
        );
        await expect(getNonce('GTEST')).rejects.toThrow('Failed to get nonce');
      }),
      { numRuns: 100 }
    );
  });

  it('verify throws Error with body.message on non-2xx', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.option(fc.string({ minLength: 1 })),
        async (status, maybeMessage) => {
          const body =
            maybeMessage !== null
              ? { message: maybeMessage }
              : { message: 'Verification failed' };
          server.use(
            http.post(`${API_BASE_URL}/auth/verify`, () => HttpResponse.json(body, { status }))
          );

          await expect(
            verify({ address: 'GTEST', signature: 'sig', nonce: 'nonce' })
          ).rejects.toThrow(maybeMessage !== null ? maybeMessage : 'Verification failed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('verify throws fallback message when body cannot be parsed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 400, max: 599 }), async (status) => {
        server.use(
          http.post(
            `${API_BASE_URL}/auth/verify`,
            () =>
              new HttpResponse('not json', {
                status,
                headers: { 'content-type': 'text/plain' },
              })
          )
        );
        await expect(
          verify({ address: 'GTEST', signature: 'sig', nonce: 'nonce' })
        ).rejects.toThrow('Verification failed');
      }),
      { numRuns: 100 }
    );
  });
});

// ── P3: verify sends correct body ───────────────────────────────────────────────

describe('P3: verify sends correct body', () => {
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
          server.use(
            http.post(`${API_BASE_URL}/auth/verify`, async ({ request: req }) => {
              captured = {
                url: req.url,
                method: req.method,
                body: await req.json().catch(() => undefined),
              };
              return HttpResponse.json({ accessToken }, { status: 201 });
            })
          );

          const result = await verify(request);

          expect(captured).not.toBeNull();
          expect(captured!.method).toBe('POST');
          expect(captured!.url).toContain('/auth/verify');

          const body = captured!.body as Record<string, string>;
          expect(body.address).toBe(request.address);
          expect(body.signature).toBe(request.signature);
          expect(body.nonce).toBe(request.nonce);
          expect(body.issuedAt).toBe(request.issuedAt);

          expect(result.accessToken).toBe(accessToken);
        }
      ),
      { numRuns: 100 }
    );
  });
});

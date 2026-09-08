/**
 * Shared MSW request handlers for the Tikka client test suites.
 *
 * These handlers are the single source of truth for API mocking:
 *  - Vitest unit specs start an `msw/node` server with `handlers` (see ../server.ts).
 *  - Playwright e2e specs reuse the exact same `routeDefs` via the adapter in
 *    ../../tests/e2e/msw.ts, so the two suites cannot drift from each other.
 *
 * Handlers are seeded from the fixtures in ../fixtures and typed against the
 * `Api*` response contracts in ../../types/types. Once the OpenAPI types are
 * generated from backend/openapi.json, the resolvers below should be typed
 * against those generated schemas so the mocks can never drift from the
 * backend contract.
 */

import { http, HttpResponse } from 'msw';
import type {
  ApiRaffleDetail,
  ApiRaffleListResponse,
  ApiUserProfile,
  ApiUserHistoryResponse,
} from '../../types/types';
import { fakeRaffleDetail } from '../fixtures';

// The origin the app's apiClient sends requests to (see config/api.ts). MSW
// resolves "/" -relative handler paths against the jsdom location origin, so the
// handlers must be registered against the real request origin to match.
const API_BASE_URL =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL ||
  'http://localhost:3001';

export { API_BASE_URL };

// ─── Fixture-derived shapes ────────────────────────────────────────────────────

/**
 * The single raffle used by the unit fixtures, completed into a fully-typed
 * `ApiRaffleDetail` so the mock cannot drift from the contract.
 */
const fixtureRaffle: ApiRaffleDetail = {
  ...fakeRaffleDetail,
  winner: null,
  created_ledger: 1000,
  finalized_ledger: null,
  metadata_cid: 'QmTest123',
  participant_count: 0,
};

const defaultListResponse: ApiRaffleListResponse = {
  raffles: [fixtureRaffle],
  total: 1,
};

const defaultProfile: ApiUserProfile = {
  address: 'GTESTADDRESS1234567890ABCDEF',
  total_tickets_bought: 10,
  total_raffles_entered: 5,
  total_raffles_won: 1,
  total_prize_xlm: '100.00',
  first_seen_ledger: 1000,
  updated_at: new Date(0).toISOString(),
};

const defaultHistory: ApiUserHistoryResponse = {
  items: [
    {
      raffle_id: 1,
      status: 'finalized',
      tickets_bought: 2,
      purchased_at_ledger: 1001,
      purchase_tx_hash: 'abc123',
      prize_amount: '100.00',
      is_winner: true,
    },
  ],
  total: 1,
};

// ─── Route definitions (shared source of truth) ─────────────────────────────────
//
// Each route is defined once as a `{ method, path, resolver }` triple. The
// `handlers` array below wraps these in MSW `http` handlers for Vitest, while
// the Playwright adapter (../../tests/e2e/msw.ts) executes the same resolvers.

export type Json = Record<string, unknown> | unknown[];

export interface RouteContext {
  request: Request;
  params: Record<string, string>;
}

export interface RouteDef {
  method: 'get' | 'post' | 'put' | 'delete';
  /** MSW-style path template, e.g. `/raffles/:id`. */
  path: string;
  resolver: (ctx: RouteContext) => Promise<{ status: number; body: Json }>;
}

export const routeDefs: RouteDef[] = [
  {
    method: 'get',
    path: '/auth/nonce',
    resolver: async ({ request }) => {
      const address = new URL(request.url).searchParams.get('address') ?? '';
      return {
        status: 200,
        body: {
          nonce: 'test-nonce',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          issuedAt: new Date().toISOString(),
          message: `Sign in as ${address}`,
        },
      };
    },
  },
  {
    method: 'post',
    path: '/auth/verify',
    resolver: async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as {
        address?: string;
      };
      return {
        status: 201,
        body: { accessToken: 'fake-jwt-token-123', address: body.address ?? '' },
      };
    },
  },
  {
    method: 'get',
    path: '/raffles',
    resolver: async () => ({ status: 200, body: defaultListResponse }),
  },
  {
    method: 'get',
    path: '/raffles/:id',
    resolver: async ({ params }) => ({
      status: 200,
      body: { ...fixtureRaffle, id: Number(params.id) },
    }),
  },
  {
    method: 'post',
    path: '/raffles/upload-image',
    resolver: async () => ({
      status: 200,
      body: { url: 'https://test.image/raffle.jpg' },
    }),
  },
  {
    method: 'get',
    path: '/users/:address',
    resolver: async ({ params }) => ({
      status: 200,
      body: { ...defaultProfile, address: String(params.address) },
    }),
  },
  {
    method: 'get',
    path: '/users/:address/history',
    resolver: async () => ({ status: 200, body: defaultHistory }),
  },
];

// ─── MSW handlers (Vitest) ──────────────────────────────────────────────────────

export const handlers = routeDefs.map((def) =>
  http[def.method](`${API_BASE_URL}${def.path}`, async ({ request, params }) => {
    const { status, body } = await def.resolver({ request, params: params as Record<string, string> });
    return HttpResponse.json(body as Record<string, unknown>, { status });
  })
);

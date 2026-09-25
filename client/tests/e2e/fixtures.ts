import type { Page, Route } from '@playwright/test';
import { demoRaffleDetails, getDemoParticipants } from '../../src/demo/demo-api';

export type JsonValue = unknown;

function asJson(body: JsonValue) {
  return JSON.stringify(body);
}

async function fulfillJson(route: Route, body: JsonValue, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: asJson(body),
  });
}

/**
 * Default minimal API mocks so the landing/home pages can render cards.
 *
 * NOTE: Route patterns are intentionally broad. If the app uses a different
 * endpoint string, update the pattern here (one place).
 */
export async function mockCommonRafflesApi(
  page: Page,
  opts?: { raffles?: unknown[]; total?: number },
) {
  const raffles = opts?.raffles ?? demoRaffleDetails;
  const total = opts?.total ?? raffles.length;

  await page.route('**/api/raffles*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = route.request().url();
    const participantMatch = url.match(/\/raffles\/(\d+)\/participants/);
    if (participantMatch) {
      await fulfillJson(route, getDemoParticipants(Number(participantMatch[1])));
      return;
    }
    const detailMatch = url.match(/\/raffles\/(\d+)(?:\?|$)/);
    if (detailMatch) {
      const raffle = raffles.find(
        (item) => (item as { id?: number }).id === Number(detailMatch[1]),
      );
      await fulfillJson(route, raffle ?? raffles[0]);
      return;
    }
    await fulfillJson(route, { raffles, total });
  });

  await page.route('**/raffles*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = route.request().url();
    const participantMatch = url.match(/\/raffles\/(\d+)\/participants/);
    if (participantMatch) {
      await fulfillJson(route, getDemoParticipants(Number(participantMatch[1])));
      return;
    }
    const detailMatch = url.match(/\/raffles\/(\d+)(?:\?|$)/);
    if (detailMatch) {
      const raffle = raffles.find(
        (item) => (item as { id?: number }).id === Number(detailMatch[1]),
      );
      await fulfillJson(route, raffle ?? raffles[0]);
      return;
    }
    await fulfillJson(route, { raffles, total });
  });
}

export async function mockRaffleDetails(page: Page, raffle: JsonValue) {
  const raffleId = (raffle as { id?: number }).id;
  await page.route('**/api/raffles/*/participants*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, getDemoParticipants(raffleId ?? 0));
  });
  await page.route('**/raffles/*/participants*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, getDemoParticipants(raffleId ?? 0));
  });
  await page.route('**/api/raffles/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, raffle);
  });
  await page.route('**/raffles/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, raffle);
  });
}

export async function mockUploadImage(page: Page, imageUrl = 'https://test.image/raffle.jpg') {
  await page.route('**/raffles/upload-image', async (route) => {
    await fulfillJson(route, { url: imageUrl });
  });
}

export async function mockWalletUnavailable(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tikka_test_wallet_available', 'false');
    localStorage.setItem('tikka_test_wallet_connected', 'false');
    localStorage.removeItem('selectedWalletId');
  });
}

export async function mockWalletAvailable(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tikka_test_wallet_available', 'true');
    localStorage.setItem('tikka_test_wallet_connected', 'true');
  });
}

/**
 * Mock SIWS auth for sign-in.
 */
export async function mockAuthUnavailableSignIn(page: Page) {
  // If the UI requests wallet/chain capability first, it will show wallet
  // unavailable. Still mock auth endpoints defensively.
  await page.route('**/auth/nonce**', async (route) => {
    await fulfillJson(route, {
      nonce: 'test-nonce',
      message: 'Sign this message',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
  });

  await page.route('**/auth/verify', async (route) => {
    await fulfillJson(route, { accessToken: 'fake-jwt-token-123' });
  });
}

/**
 * Mock raffle creation (draft).
 * Acceptance asks for create raffle draft happy path.
 */
export async function mockCreateRaffleDraft(page: Page, created: { id: number } = { id: 99 }) {
  await page.route('**/api/raffles/create*', async (route) => {
    await fulfillJson(route, { id: created.id, success: true, status: 'draft' }, 201);
  });
  // Some UIs might call a different endpoint.
  await page.route('**/raffles/create*', async (route) => {
    await fulfillJson(route, { id: created.id, success: true, status: 'draft' }, 201);
  });
}

/**
 * Ticket purchase validation.
 * Mock any backend/contract call used during purchase.
 */
export async function mockTicketPurchase(
  page: Page,
  opts?: { success?: boolean; txHash?: string },
) {
  const body = { success: opts?.success ?? true, txHash: opts?.txHash ?? '0x123abc' };

  // Existing specs used **/api/contract/buy and **/api/contract/* patterns.
  await page.route('**/api/contract/buy**', async (route) => {
    await fulfillJson(route, body, 200);
  });
  await page.route('**/api/contract/*buy*', async (route) => {
    await fulfillJson(route, body, 200);
  });

  // Also catch non-/api patterns used elsewhere.
  await page.route('**/contract/buy**', async (route) => {
    await fulfillJson(route, body, 200);
  });
}

import type { Page, Route } from '@playwright/test';

export type JsonValue = any;

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
export async function mockCommonRafflesApi(page: Page, opts?: { raffles?: any[]; total?: number }) {
    const raffles = opts?.raffles ?? [
        {
            id: 42,
            title: 'Smoke Raffle',
            status: 'open',
            creator: 'GTESTADDRESS1234567890ABCDEF',
            end_time: new Date(Date.now() + 3600_000).toISOString(),
            ticket_price: '0.1',
            max_tickets: 100,
            tickets_sold: 0,
            asset: 'XLM',
            prize_amount: '10',
            image_url: 'https://placekitten.com/800/450',
            created_at: new Date().toISOString(),
        },
    ];
    const total = opts?.total ?? raffles.length;

    await page.route('**/api/raffles*', async (route) => {
        await fulfillJson(route, { data: raffles, total });
    });

    await page.route('**/raffles*', async (route) => {
        // Some pages might call non-/api endpoints (existing tests do /raffles/:id)
        // Ensure they still return something deterministic.
        const url = route.request().url();
        if (/\/raffles\/\d+/.test(url)) {
            await fulfillJson(route, raffles[0]);
            return;
        }
        await fulfillJson(route, { data: raffles, total });
    });
}

export async function mockRaffleDetails(page: Page, raffle: any) {
    await page.route('**/api/raffles/*', async (route) => {
        await fulfillJson(route, raffle);
    });
    await page.route('**/raffles/*', async (route) => {
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
        await fulfillJson(route, { nonce: 'test-nonce', message: 'Sign this message', issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() });
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
export async function mockTicketPurchase(page: Page, opts?: { success?: boolean; txHash?: string }) {
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


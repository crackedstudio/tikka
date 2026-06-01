import type { Page, Route } from '@playwright/test';

export type MockRaffle = {
    id: number;
    title: string;
    description: string;
    creator: string;
    status: string;
    end_time: string;
    ticket_price: string;
    max_tickets: number;
    tickets_sold: number;
    asset: string;
    prize_amount: string;
    image_url: string;
    created_at: string;
};

export const FAKE_WALLET_ID = 'test-wallet';
export const FAKE_AUTH_TOKEN = 'fake-jwt-token-123';

export const DEFAULT_RAFFLE: MockRaffle = {
    id: 123,
    title: 'Test Raffle',
    description: 'Demo raffle for end-to-end test',
    creator: 'GTESTADDRESS1234567890ABCDEF',
    status: 'open',
    end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ticket_price: '0.1',
    max_tickets: 100,
    tickets_sold: 0,
    asset: 'XLM',
    prize_amount: '100',
    image_url: 'https://placekitten.com/800/450',
    created_at: new Date().toISOString(),
};

export function setTestAuthStorage(page: Page) {
    // These storage keys are referenced by existing tests.
    return Promise.all([
        page.evaluate(() => {
            sessionStorage.setItem('tikka_auth_token', 'fake-jwt-token-123');
            localStorage.setItem('selectedWalletId', 'test-wallet');
        }),
    ]);
}

export async function mockRafflesList(page: Page, raffles: MockRaffle[] = [DEFAULT_RAFFLE]) {
    // Payload documented for deterministic UI.
    // Expected by client: { data: [...], total: number }
    await page.route('**/api/raffles*', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: raffles,
                total: raffles.length,
            }),
        });
    });
}

export async function mockRaffleDetails(page: Page, raffle: MockRaffle = DEFAULT_RAFFLE) {
    // Expected by client on /details page.
    await page.route(`**/api/raffles/${raffle.id}*`, async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(raffle),
        });
    });

    // Some implementations may call a details endpoint via query-style.
    await page.route(`**/api/raffles*raffle=${raffle.id}*`, async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(raffle),
        });
    });
}

export async function mockNonceAndVerify(page: Page) {
    const fakeNonceResponse = {
        nonce: 'test-nonce',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        issuedAt: new Date().toISOString(),
        message: 'Sign this message to authenticate',
    };

    await page.route('**/auth/nonce**', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(fakeNonceResponse),
        });
    });

    await page.route('**/auth/verify', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ accessToken: FAKE_AUTH_TOKEN }),
            headers: { 'Content-Type': 'application/json' },
        });
    });
}

export async function mockWalletUnavailableSignIn(page: Page) {
    // Deterministic behavior when wallet/chain deps are not present.
    // We keep it generic by blocking Stellar wallet connect calls.
    await page.route('**/wallet*', async (route: Route) => {
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
                error: 'Wallet unavailable in test environment',
            }),
        });
    });
}

export async function mockCreateRaffleDraft(page: Page, raffleId = 123) {
    // Documented response expected by existing create flow tests.
    // Existing tests mock '**/api/raffles/create' with status 201 and body: { id, success }
    await page.route('**/api/raffles/create', async (route: Route) => {
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: raffleId, success: true, mode: 'draft' }),
        });
    });
}

export async function mockUploadImage(page: Page) {
    await page.route('**/raffles/upload-image', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ url: 'https://test.image/raffle.jpg' }),
        });
    });
}

export async function mockTicketPurchase(page: Page, raffleId = DEFAULT_RAFFLE.id) {
    // Existing tests mock '**/api/contract/buy' and expect success modal.
    await page.route('**/api/contract/buy', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, txHash: '0x123abc', raffleId }),
        });
    });

    // Optionally, if the UI refetches raffle after purchase.
    await page.route(`**/api/raffles/${raffleId}*`, async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...DEFAULT_RAFFLE,
                id: raffleId,
                tickets_sold: 1,
            }),
        });
    });
}

import { test, expect } from '@playwright/test';
import {
    expectNoA11yViolations,
    expectEscapeClosesModal,
    expectFocusTrap,
} from '../a11y';
import {
    mockCommonRafflesApi,
    mockRaffleDetails,
    mockUploadImage,
} from './fixtures';

/* ------------------------------------------------------------------ */
/*  Shared mock data                                                   */
/* ------------------------------------------------------------------ */

const sampleRaffle = {
    id: 42,
    title: 'A11y Test Raffle',
    description: 'A raffle used for accessibility tests',
    status: 'open',
    creator: 'GTESTADDRESS1234567890ABCDEF',
    end_time: new Date(Date.now() + 3_600_000).toISOString(),
    ticket_price: '0.1',
    max_tickets: 100,
    tickets_sold: 0,
    asset: 'XLM',
    prize_amount: '10',
    image_url: 'https://placekitten.com/800/450',
    created_at: new Date().toISOString(),
};

const sampleRaffleDetails = {
    ...sampleRaffle,
    description: 'Detailed raffle for a11y tests',
    metadata: {
        title: 'A11y Test Raffle Detail',
        images: [sampleRaffle.image_url],
    },
};

/* ------------------------------------------------------------------ */
/*  Route-level axe scans                                              */
/* ------------------------------------------------------------------ */

test.describe('Accessibility — route scans', () => {
    test.beforeEach(async ({ page }) => {
        await mockUploadImage(page);
        await mockCommonRafflesApi(page, { raffles: [sampleRaffle], total: 1 });
        await mockRaffleDetails(page, sampleRaffleDetails);
    });

    test('landing page (/) passes axe', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expectNoA11yViolations(page);
    });

    test('home page (/home) passes axe', async ({ page }) => {
        await page.goto('/home');
        await page.waitForLoadState('networkidle');
        await expectNoA11yViolations(page);
    });

    test('raffle detail (/raffles/42) passes axe', async ({ page }) => {
        await page.goto('/raffles/42');
        await page.waitForLoadState('networkidle');
        await expectNoA11yViolations(page);
    });

    test('create raffle (/create) passes axe', async ({ page }) => {
        await page.goto('/create');
        await page.waitForLoadState('networkidle');
        await expectNoA11yViolations(page);
    });

    test('settings (/settings) passes axe', async ({ page }) => {
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');
        await expectNoA11yViolations(page);
    });

    test('leaderboard (/leaderboard) passes axe', async ({ page }) => {
        await page.goto('/leaderboard');
        await page.waitForLoadState('networkidle');
        await expectNoA11yViolations(page);
    });

    test('search (/search) passes axe', async ({ page }) => {
        await page.goto('/search');
        await page.waitForLoadState('networkidle');
        await expectNoA11yViolations(page);
    });
});

/* ------------------------------------------------------------------ */
/*  Modal focus-trap & Escape-to-close                                 */
/* ------------------------------------------------------------------ */

test.describe('Accessibility — modal behaviour', () => {
    test('Escape key closes the ticket confirmation modal', async ({
        page,
    }) => {
        await mockUploadImage(page);
        await mockCommonRafflesApi(page, { raffles: [sampleRaffle], total: 1 });
        await mockRaffleDetails(page, sampleRaffleDetails);
        await page.goto('/home');
        await page.waitForLoadState('networkidle');

        // Open the enter-raffle modal
        const enterBtn = page.getByTestId('enter-raffle-btn').first();
        await expect(enterBtn).toBeVisible({ timeout: 10_000 });

        await expectEscapeClosesModal(
            page,
            () => enterBtn.click(),
            '[role="dialog"]',
        );
    });

    test('Focus stays trapped inside the ticket modal when tabbing', async ({
        page,
    }) => {
        await mockUploadImage(page);
        await mockCommonRafflesApi(page, { raffles: [sampleRaffle], total: 1 });
        await mockRaffleDetails(page, sampleRaffleDetails);
        await page.goto('/home');
        await page.waitForLoadState('networkidle');

        const enterBtn = page.getByTestId('enter-raffle-btn').first();
        await expect(enterBtn).toBeVisible({ timeout: 10_000 });

        await expectFocusTrap(
            page,
            () => enterBtn.click(),
            '[role="dialog"]',
        );
    });
});

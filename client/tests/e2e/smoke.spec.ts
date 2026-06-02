import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    mockCommonRafflesApi,
    mockRaffleDetails,
    mockUploadImage,
    mockWalletUnavailable,
} from './fixtures';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleImage = path.resolve(__dirname, '../../src/assets/svg/logo.svg');

const smokeRaffle = {
    id: 42,
    title: 'Smoke Raffle',
    description: 'Smoke Raffle for e2e smoke tests',
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
};

const smokeRaffleDetails = {
    ...smokeRaffle,
    description: 'Smoke Raffle details page',
    metadata: {
        title: 'Smoke Raffle Detail',
        images: [smokeRaffle.image_url],
    },
};

test.describe('E2E smoke tests', () => {
    test.beforeEach(async ({ page }) => {
        await mockUploadImage(page);
        await mockCommonRafflesApi(page, { raffles: [smokeRaffle], total: 1 });
        await mockRaffleDetails(page, smokeRaffleDetails);
    });

    test('landing page navigates to raffle details', async ({ page }) => {
        await page.goto('/home');

        const cardLink = page.locator(`a[href="/raffles/${smokeRaffle.id}"]`).first();
        await expect(cardLink).toBeVisible({ timeout: 10000 });
        await cardLink.click();

        await expect(page).toHaveURL(new RegExp(`/raffles/${smokeRaffle.id}$`));
        await expect(page.getByText('Smoke Raffle Detail')).toBeVisible();
    });

    test('wallet unavailable sign-in shows No Wallet', async ({ page }) => {
        await mockWalletUnavailable(page);
        await page.goto('/home');

        const noWalletButton = page.locator('button:has-text("No Wallet")');
        await expect(noWalletButton).toBeVisible({ timeout: 10000 });
        await expect(noWalletButton).toBeDisabled();
    });

    test('create raffle happy path shows created success modal', async ({ page }) => {
        await page.goto('/create');

        await page.fill('input[placeholder="Enter raffle title"]', 'Smoke Draft Raffle');
        await page.fill('textarea[placeholder="Describe your raffle prize in detail"]', 'A smoke draft raffle created by e2e.');
        await page.click('button:has-text("Continue")');

        await page.setInputFiles('input[type="file"]', sampleImage);
        await page.click('button:has-text("Continue")');

        await page.fill('input[placeholder="0.0"]', '0.5');
        await page.fill('input[placeholder="0"]', '20');
        await page.click('button:has-text("Continue")');

        await page.fill('input[type="number"] >> nth=0', '1');
        await page.click('button:has-text("Continue")');

        await page.waitForSelector('button:has-text("Publish Raffle")', { timeout: 20000 });
        await page.click('button:has-text("Publish Raffle")');

        await expect(page.getByText('Raffle Created Successfully')).toBeVisible({ timeout: 20000 });
    });

    test('ticket purchase validation shows modal and increments entries', async ({ page }) => {
        await page.goto('/home');

        const enterButton = page.getByTestId('enter-raffle-btn').first();
        await expect(enterButton).toBeVisible({ timeout: 10000 });
        await enterButton.click();

        const successModal = page.getByTestId('success-modal');
        await expect(successModal).toBeVisible({ timeout: 20000 });
        await expect(successModal).toContainText("Let's go!!!");

        const entriesCount = page.getByTestId('entries-count').first();
        await expect(entriesCount).toHaveText('1');
    });
});

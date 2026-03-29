import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleImage = path.resolve(__dirname, '../../src/assets/svg/logo.svg');

const fakeRaffleDetail = {
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

test.describe('Raffle creation flow', () => {
  test('goes through wizard and navigates to raffle details', async ({ page }) => {


    await page.route('**/raffles/upload-image', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ url: 'https://test.image/raffle.jpg' }), headers: { 'Content-Type': 'application/json' } });
    });

    await page.route('**/raffles/123', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(fakeRaffleDetail), headers: { 'Content-Type': 'application/json' } });
    });

    await page.goto('/');

    await page.evaluate(() => {
      sessionStorage.setItem('tikka_auth_token', 'fake-jwt-token-123');
      localStorage.setItem('selectedWalletId', 'test-wallet');
    });

    await page.goto('/create');

    // Details step
    await page.fill('input[placeholder="Enter raffle title"]', 'My Playwright Raffle');
    await page.fill('textarea[placeholder="Describe your raffle prize in detail"]', 'A raffle created during automated tests.');
    await page.click('button:has-text("Continue")');

    // Image step: upload sample image
    await page.setInputFiles('input[type="file"]', sampleImage);
    await page.click('button:has-text("Continue")');

    // Pricing
    await page.fill('input[placeholder="0.0"]', '0.5');
    await page.fill('input[placeholder="0"]', '50');
    await page.click('button:has-text("Continue")');

    // Duration
    await page.fill('input[type="number"] >> nth=0', '1');
    await page.click('button:has-text("Continue")');

    // Review -> Publish
    const allButtons = await page.locator('button').allTextContents();
    console.log('Buttons on Review step:', allButtons);
    await page.waitForTimeout(1000);
    await page.waitForSelector('button:has-text("Publish Raffle")', { timeout: 20000 });
    await page.click('button:has-text("Publish Raffle")');

    await page.waitForTimeout(2000);

    await page.waitForURL('**/raffles/123', { timeout: 20000 });
    await expect(page).toHaveURL(/.*\/raffles\/123$/);

    // Verify data appears on raffle page
    await expect(page.locator('h1')).toHaveText(/Test Raffle|Raffle #123/);
  });
});

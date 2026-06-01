import { test, expect } from '@playwright/test';
import { mockCreateRaffleDraft, mockUploadImage, setTestAuthStorage } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleImage = path.resolve(__dirname, '../../src/assets/svg/logo.svg');

test.describe('Smoke: create raffle draft', () => {
    test('creates a draft and navigates to raffle page with mocked network responses', async ({ page }) => {
        await mockUploadImage(page);
        await mockCreateRaffleDraft(page, 123);
        await setTestAuthStorage(page);

        await page.goto('/create');

        // Fill wizard fields (selectors based on existing e2e test conventions)
        await page.fill('input[placeholder="Enter raffle title"]', 'My Draft Raffle');
        await page.fill(
            'textarea[placeholder="Describe your raffle prize in detail"]',
            'Draft created during automated tests.'
        );
        await page.click('button:has-text("Continue")');

        // Image step
        await page.setInputFiles('input[type="file"]', sampleImage);
        await page.click('button:has-text("Continue")');

        // Pricing
        await page.fill('input[placeholder="0.0"]', '0.5');
        await page.fill('input[placeholder="0"]', '50');
        await page.click('button:has-text("Continue")');

        // Duration
        await page.fill('input[type="number"]', '1');
        await page.click('button:has-text("Continue")');

        // Review -> Draft/Publish
        const draftButton = page.getByRole('button', { name: /draft/i });
        if ((await draftButton.count()) > 0) {
            await draftButton.click();
        } else {
            await page.click('button:has-text("Publish Raffle")');
        }

        await expect(page.locator('h1')).toBeVisible({ timeout: 20000 });
    });
});

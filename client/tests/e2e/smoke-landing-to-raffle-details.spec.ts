import { test, expect } from '@playwright/test';
import {
    DEFAULT_RAFFLE,
    mockRafflesList,
    mockRaffleDetails,
    setTestAuthStorage,
} from './fixtures';

test.describe('Smoke: landing -> raffle details', () => {
    test('navigates from landing/home list to raffle details with mocked backend', async ({ page }) => {
        await mockRafflesList(page, [DEFAULT_RAFFLE]);
        await mockRaffleDetails(page, DEFAULT_RAFFLE);
        await setTestAuthStorage(page);

        await page.goto('/');

        // Prefer deterministic testid if available; fallback to link navigation.
        const cardLink = page.getByRole('link', { name: /raffle/i }).first();
        if ((await cardLink.count()) > 0) {
            await cardLink.click();
        } else {
            // Common structure: first link navigates to details?raffle=<id>
            await page.getByRole('link').first().click();
        }

        await expect(page).toHaveURL(new RegExp(`/details\?raffle=${DEFAULT_RAFFLE.id}$`));
        await expect(page.locator('h1')).toContainText(/Test Raffle/i);
    });
});

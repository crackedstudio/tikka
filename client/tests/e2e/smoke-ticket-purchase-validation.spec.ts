import { test, expect } from '@playwright/test';
import { DEFAULT_RAFFLE, mockRafflesList, mockRaffleDetails, mockTicketPurchase, setTestAuthStorage } from './fixtures';

test.describe('Smoke: ticket purchase validation', () => {
    test('shows processing state and success modal on purchase', async ({ page }) => {
        await mockRafflesList(page, [DEFAULT_RAFFLE]);
        await mockRaffleDetails(page, DEFAULT_RAFFLE);
        await mockTicketPurchase(page, DEFAULT_RAFFLE.id);
        await setTestAuthStorage(page);

        await page.goto('/home');

        // UI uses testid in existing ticket-purchase.spec.ts
        const btn = page.getByTestId('enter-raffle-btn').first();
        await expect(btn).toBeVisible();

        // Clicking triggers purchase flow
        await btn.click();

        // Expect loading/processing state deterministically (existing spec asserts Processing...)
        await expect(btn).toHaveText(/Processing\.\.\./);

        // Success modal should appear
        const modal = page.getByTestId('success-modal');
        await expect(modal).toBeVisible({ timeout: 10_000 });

        await expect(modal).toContainText("Let's go!!!");
        await expect(modal).toContainText(/successful/i);

        // Continue button exists
        await expect(page.getByTestId('success-continue-btn')).toBeVisible();
    });
});

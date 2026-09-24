import { test, expect } from '@playwright/test';
import { applySharedHandlers } from './msw';

const fakeJwt = 'fake-jwt-token-123';

test.describe('Login flow (SIWS)', () => {
  test('user can sign in and get JWT in sessionStorage', async ({ page }) => {
    // Deterministic auth responses shared with the unit specs.
    await applySharedHandlers(page);

    await page.goto('/home');

    // Wait for wallet to auto-connect in test mode
    await expect(page.locator('button:has-text("Connect Wallet")')).toHaveCount(0, { timeout: 10000 });

    // Click Sign In once available
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Sign In")');

    await expect(page.locator('button:has-text("Signed in as")')).toBeVisible({ timeout: 10000 });

    const token = await page.evaluate(() => sessionStorage.getItem('tikka_auth_token'));
    expect(token).toBe(fakeJwt);
  });
});

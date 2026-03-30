import { test, expect } from '@playwright/test';

const fakeNonceResponse = {
  nonce: 'test-nonce',
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  issuedAt: new Date().toISOString(),
  message: 'Sign this message to authenticate',
};

const fakeJwt = 'fake-jwt-token-123';

test.describe('Login flow (SIWS)', () => {
  test('user can sign in and get JWT in sessionStorage', async ({ page }) => {
    await page.route('**/auth/nonce**', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(fakeNonceResponse), headers: { 'Content-Type': 'application/json' } });
    });

    await page.route('**/auth/verify', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ accessToken: fakeJwt }), headers: { 'Content-Type': 'application/json' } });
    });

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

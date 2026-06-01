import { test, expect } from '@playwright/test';
import { mockNonceAndVerify, mockWalletUnavailableSignIn } from './fixtures';

test.describe('Smoke: wallet unavailable sign-in', () => {
    test('shows a deterministic wallet unavailable behavior and does not crash', async ({ page }) => {
        await mockWalletUnavailableSignIn(page);
        // Keep auth endpoints deterministic so we can still assert UI.
        await mockNonceAndVerify(page);

        await page.goto('/home');

        // If the UI has explicit messaging, assert on it.
        const walletError = page.locator('text=/wallet unavailable/i');
        const signInButton = page.getByRole('button', { name: /sign in/i });

        // At least one of the deterministic outcomes should happen.
        // - Either UI blocks sign-in / shows wallet error
        // - Or it falls back to SIWS without wallet connect
        await Promise.race([
            walletError.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
            signInButton.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => false),
        ]);

        // Ensure page remains interactive and no fatal error view.
        await expect(page.locator('text=/error|failed/i').first()).not.toBeVisible();
    });
});


import { test, expect, devices } from '@playwright/test';
import { mockCommonRafflesApi, mockWalletUnavailable } from './fixtures';

/**
 * E2E coverage for the mobile navigation keyboard behaviour requested in #831
 * (WCAG 2.1 §2.1.2 — No Keyboard Trap): the menu must close on Escape, focus
 * must return to the hamburger trigger, and the backdrop must dismiss it too.
 *
 * The component behaviour is already implemented in `src/components/Navbar.tsx`;
 * these tests pin it down at the browser level, where the unit spec
 * (`src/components/Navbar.spec.tsx`) uses synthetic `fireEvent` calls only.
 */
test.use({ ...devices['Pixel 5'] });

test.describe('Mobile navigation — Escape closes the menu (#831)', () => {
    test.beforeEach(async ({ page }) => {
        await mockWalletUnavailable(page);
        await mockCommonRafflesApi(page);
        await page.goto('/home');
    });

    test('pressing Escape closes the menu and returns focus to the hamburger trigger', async ({
        page,
    }) => {
        const trigger = page.getByRole('button', { name: /open navigation menu/i });
        const panel = page.getByTestId('mobile-nav-panel');

        await expect(trigger).toBeVisible();
        await expect(panel).not.toBeVisible();

        await trigger.click();

        await expect(panel).toBeVisible();
        await expect(page.getByTestId('mobile-nav-backdrop')).toBeVisible();

        await page.keyboard.press('Escape');

        await expect(panel).not.toBeVisible();
        await expect(
            page.getByRole('button', { name: /open navigation menu/i }),
        ).toBeFocused();
    });

    test('Escape closes the menu while focus is inside the mobile search field', async ({
        page,
    }) => {
        const trigger = page.getByRole('button', { name: /open navigation menu/i });
        const panel = page.getByTestId('mobile-nav-panel');

        await trigger.click();
        await expect(panel).toBeVisible();

        const mobileSearch = panel.locator('input[type="text"]');
        await mobileSearch.fill('stellar');
        await expect(mobileSearch).toBeFocused();

        await page.keyboard.press('Escape');

        await expect(panel).not.toBeVisible();
        await expect(
            page.getByRole('button', { name: /open navigation menu/i }),
        ).toBeFocused();
    });

    test('clicking the backdrop closes the menu and restores focus to the trigger', async ({
        page,
    }) => {
        const trigger = page.getByRole('button', { name: /open navigation menu/i });
        const panel = page.getByTestId('mobile-nav-panel');

        await trigger.click();
        await expect(panel).toBeVisible();

        await page.getByTestId('mobile-nav-backdrop').click();

        await expect(panel).not.toBeVisible();
        await expect(
            page.getByRole('button', { name: /open navigation menu/i }),
        ).toBeFocused();
    });
});

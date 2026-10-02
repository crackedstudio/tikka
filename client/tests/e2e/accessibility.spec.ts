import { test, expect } from '@playwright/test';
import { expectNoA11yViolations, expectEscapeClosesModal, expectFocusTrap } from '../a11y';
import { mockCommonRafflesApi, mockRaffleDetails, mockUploadImage } from './fixtures';
import { demoRaffleDetails, getDemoRaffleByName } from '../../src/demo/demo-api';

/* ------------------------------------------------------------------ */
/*  Shared mock data                                                   */
/* ------------------------------------------------------------------ */

const sampleRaffleDetails = getDemoRaffleByName('live');

/* ------------------------------------------------------------------ */
/*  Route-level axe scans                                              */
/* ------------------------------------------------------------------ */

test.describe('Accessibility — route scans', () => {
  test.beforeEach(async ({ page }) => {
    await mockUploadImage(page);
    await mockCommonRafflesApi(page, { raffles: demoRaffleDetails });
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

  test(`raffle detail (/raffles/${sampleRaffleDetails.id}) passes axe`, async ({ page }) => {
    await page.goto(`/raffles/${sampleRaffleDetails.id}`);
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
  test('Escape key closes the ticket confirmation modal', async ({ page }) => {
    await mockUploadImage(page);
    await mockCommonRafflesApi(page, { raffles: demoRaffleDetails });
    await mockRaffleDetails(page, sampleRaffleDetails);
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Open the enter-raffle modal
    const enterBtn = page.getByTestId('enter-raffle-btn').first();
    await expect(enterBtn).toBeVisible({ timeout: 10_000 });

    await expectEscapeClosesModal(page, () => enterBtn.click(), '[role="dialog"]');
  });

  test('Focus stays trapped inside the ticket modal when tabbing', async ({ page }) => {
    await mockUploadImage(page);
    await mockCommonRafflesApi(page, { raffles: demoRaffleDetails });
    await mockRaffleDetails(page, sampleRaffleDetails);
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    const enterBtn = page.getByTestId('enter-raffle-btn').first();
    await expect(enterBtn).toBeVisible({ timeout: 10_000 });

    await expectFocusTrap(page, () => enterBtn.click(), '[role="dialog"]');
  });
});

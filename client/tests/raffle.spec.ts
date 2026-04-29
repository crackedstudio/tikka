import { test, expect } from '@playwright/test';

test.describe('Raffle Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the raffles API so the home page can load
    await page.route('**/api/raffles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          total: 0,
        }),
      });
    });
  });

  test('Creating a raffle shows a success message', async ({ page }) => {
    // Navigate to the create raffle page
    await page.goto('/create-raffle');

    // Fill in raffle creation form (assumed fields based on standard implementations)
    await page.fill('input[name="title"]', 'Test Raffle');
    await page.fill('textarea[name="description"]', 'Win this amazing test item!');
    await page.fill('input[name="ticketPrice"]', '5');
    
    // Mock the submission endpoint to simulate success
    await page.route('**/api/raffles/create', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 99, success: true }),
      });
    });

    // Click submit and wait for success state
    await page.click('button[type="submit"]');

    // Asser expected behavior
    await expect(page.locator('text=Raffle Created')).toBeVisible();
  });

  test('Buying a ticket executes successfully', async ({ page }) => {
    // Navigate to a details page
    await page.goto('/details?raffle=99');

    // Mock contract network call for ticket purchase
    await page.route('**/api/contract/buy', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, txHash: '0x123abc' }),
      });
    });

    // Click buy button
    await page.click('button:has-text("Buy Ticket")');

    // Wait for the success indication
    await expect(page.locator('text=Purchase Successful')).toBeVisible();
  });
});

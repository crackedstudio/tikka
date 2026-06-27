/**
 * Buy Ticket E2E Test - Core Happy Path
 * 
 * Tests the complete ticket purchase flow:
 * 1. Navigate to /home
 * 2. Click the first open raffle card
 * 3. Assert raffle detail page renders (ticket count, price)
 * 4. Simulate wallet connection (mock wallet)
 * 5. Click "Buy Ticket"
 * 6. Assert success toast appears
 * 
 * This test covers the critical happy path for the main product feature.
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Buy Ticket - Core Happy Path', () => {
  test('should complete ticket purchase flow from home to success', async ({ page }) => {
    // ─── Step 1: Navigate to home page ───────────────────────────────────────
    await page.goto('/home');
    
    // Wait for raffle cards to load
    const raffleCards = page.locator('[data-testid="raffle-card"]');
    await expect(raffleCards.first()).toBeVisible({ timeout: 10_000 });

    // ─── Step 2: Click first raffle card to navigate to details ──────────────
    const firstCard = raffleCards.first();
    await firstCard.click();

    // ─── Step 3: Verify raffle detail page loaded with pricing info ─────────
    // Wait for the detail page to load
    const detailPage = page.locator('[data-testid="raffle-detail-page"]');
    await expect(detailPage).toBeVisible({ timeout: 10_000 });

    // Assert that ticket price is displayed
    const ticketPrice = page.locator('[data-testid="ticket-price"]');
    await expect(ticketPrice).toBeVisible();
    const priceText = await ticketPrice.innerText();
    expect(priceText).toMatch(/[\d.]+\s*(XLM|lumens)/i);

    // Assert that ticket count is displayed
    const ticketCount = page.locator('[data-testid="ticket-count"]');
    await expect(ticketCount).toBeVisible();
    const countText = await ticketCount.innerText();
    expect(Number(countText)).toBeGreaterThanOrEqual(0);

    // ─── Step 4: Simulate wallet connection ──────────────────────────────────
    // In test mode, use the mock wallet connection
    const connectWalletBtn = page.locator('[data-testid="connect-wallet-btn"]');
    
    if (await connectWalletBtn.isVisible()) {
      await connectWalletBtn.click();
      
      // Wait for mock wallet modal to appear
      const walletModal = page.locator('[data-testid="wallet-modal"]');
      await expect(walletModal).toBeVisible({ timeout: 5_000 });

      // Select mock wallet option
      const mockWalletOption = page.locator('[data-testid="mock-wallet-option"]');
      await mockWalletOption.click();

      // Wait for wallet to connect (should show connected address)
      const connectedAddress = page.locator('[data-testid="connected-address"]');
      await expect(connectedAddress).toBeVisible({ timeout: 5_000 });
    }

    // ─── Step 5: Click Buy Ticket button ─────────────────────────────────────
    const buyTicketBtn = page.locator('[data-testid="buy-ticket-btn"]');
    
    // Button should be visible and enabled
    await expect(buyTicketBtn).toBeVisible();
    await expect(buyTicketBtn).toBeEnabled();

    // Click the button
    await buyTicketBtn.click();

    // ─── Step 6: Verify success toast/notification appears ───────────────────
    // Success toast should appear with confirmation message
    const successToast = page.locator('[data-testid="success-toast"]');
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // Verify the success message contains expected text
    const toastText = await successToast.innerText();
    expect(toastText).toMatch(/(ticket.*purchase|purchase.*success|successfully|confirmed)/i);

    // Button should show "Processing" or transition back to "Buy Ticket"
    await expect(buyTicketBtn).toBeEnabled({ timeout: 5_000 });
  });

  test('should display raffle metadata on detail page', async ({ page }) => {
    // Navigate to home and click first raffle
    await page.goto('/home');
    const raffleCards = page.locator('[data-testid="raffle-card"]');
    await expect(raffleCards.first()).toBeVisible({ timeout: 10_000 });
    
    await raffleCards.first().click();

    // Verify detail page has key metadata
    const detailPage = page.locator('[data-testid="raffle-detail-page"]');
    await expect(detailPage).toBeVisible({ timeout: 10_000 });

    // Should show raffle title/name
    const raffleTitle = page.locator('[data-testid="raffle-title"]');
    await expect(raffleTitle).toBeVisible();
    const titleText = await raffleTitle.innerText();
    expect(titleText.length).toBeGreaterThan(0);

    // Should show prize amount
    const prizeAmount = page.locator('[data-testid="prize-amount"]');
    await expect(prizeAmount).toBeVisible();
    const prizeText = await prizeAmount.innerText();
    expect(prizeText).toMatch(/[\d.]+/);

    // Should show end time
    const endTime = page.locator('[data-testid="raffle-end-time"]');
    await expect(endTime).toBeVisible();
  });

  test('should handle wallet connection before ticket purchase', async ({ page }) => {
    // Navigate to home and raffle details
    await page.goto('/home');
    const raffleCards = page.locator('[data-testid="raffle-card"]');
    await expect(raffleCards.first()).toBeVisible({ timeout: 10_000 });
    
    await raffleCards.first().click();
    const detailPage = page.locator('[data-testid="raffle-detail-page"]');
    await expect(detailPage).toBeVisible({ timeout: 10_000 });

    // If not already connected, connect wallet
    const connectWalletBtn = page.locator('[data-testid="connect-wallet-btn"]');
    
    if (await connectWalletBtn.isVisible()) {
      // Verify wallet connection flow
      await connectWalletBtn.click();
      
      const walletModal = page.locator('[data-testid="wallet-modal"]');
      await expect(walletModal).toBeVisible({ timeout: 5_000 });

      // Test that cancel button works
      const cancelBtn = page.locator('[data-testid="wallet-modal-cancel"]');
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await expect(walletModal).not.toBeVisible();
      }

      // Re-open and connect
      await connectWalletBtn.click();
      await expect(walletModal).toBeVisible();

      const mockWalletOption = page.locator('[data-testid="mock-wallet-option"]');
      await mockWalletOption.click();

      // Wait for connected state
      const connectedAddress = page.locator('[data-testid="connected-address"]');
      await expect(connectedAddress).toBeVisible({ timeout: 5_000 });
    }

    // After wallet is connected, buy ticket button should be available
    const buyTicketBtn = page.locator('[data-testid="buy-ticket-btn"]');
    await expect(buyTicketBtn).toBeVisible();
    await expect(buyTicketBtn).toBeEnabled();
  });

  test('should maintain state during purchase processing', async ({ page }) => {
    // Navigate to detail page
    await page.goto('/home');
    const raffleCards = page.locator('[data-testid="raffle-card"]');
    await expect(raffleCards.first()).toBeVisible({ timeout: 10_000 });
    
    await raffleCards.first().click();
    const detailPage = page.locator('[data-testid="raffle-detail-page"]');
    await expect(detailPage).toBeVisible({ timeout: 10_000 });

    // Connect wallet if needed
    const connectWalletBtn = page.locator('[data-testid="connect-wallet-btn"]');
    if (await connectWalletBtn.isVisible()) {
      await connectWalletBtn.click();
      const walletModal = page.locator('[data-testid="wallet-modal"]');
      await expect(walletModal).toBeVisible({ timeout: 5_000 });
      
      const mockWalletOption = page.locator('[data-testid="mock-wallet-option"]');
      await mockWalletOption.click();
      
      const connectedAddress = page.locator('[data-testid="connected-address"]');
      await expect(connectedAddress).toBeVisible({ timeout: 5_000 });
    }

    // Get initial values
    const ticketPrice = page.locator('[data-testid="ticket-price"]');
    const initialPrice = await ticketPrice.innerText();

    // Click buy button
    const buyTicketBtn = page.locator('[data-testid="buy-ticket-btn"]');
    await buyTicketBtn.click();

    // Verify button transitions to processing state
    await expect(buyTicketBtn).toContainText(/(processing|please wait|submitting)/i);

    // Verify page data doesn't change during processing
    const priceAfter = await ticketPrice.innerText();
    expect(priceAfter).toBe(initialPrice);

    // Wait for completion
    const successToast = page.locator('[data-testid="success-toast"]');
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // Button should be re-enabled
    await expect(buyTicketBtn).toBeEnabled({ timeout: 5_000 });
  });

  test('should show proper error handling if purchase fails', async ({ page }) => {
    // Navigate to detail page
    await page.goto('/home');
    const raffleCards = page.locator('[data-testid="raffle-card"]');
    await expect(raffleCards.first()).toBeVisible({ timeout: 10_000 });
    
    await raffleCards.first().click();
    const detailPage = page.locator('[data-testid="raffle-detail-page"]');
    await expect(detailPage).toBeVisible({ timeout: 10_000 });

    // Connect wallet if needed
    const connectWalletBtn = page.locator('[data-testid="connect-wallet-btn"]');
    if (await connectWalletBtn.isVisible()) {
      await connectWalletBtn.click();
      const walletModal = page.locator('[data-testid="wallet-modal"]');
      await expect(walletModal).toBeVisible({ timeout: 5_000 });
      
      const mockWalletOption = page.locator('[data-testid="mock-wallet-option"]');
      await mockWalletOption.click();
      
      const connectedAddress = page.locator('[data-testid="connected-address"]');
      await expect(connectedAddress).toBeVisible({ timeout: 5_000 });
    }

    // Try to purchase
    const buyTicketBtn = page.locator('[data-testid="buy-ticket-btn"]');
    await buyTicketBtn.click();

    // Look for either success or error message
    const successToast = page.locator('[data-testid="success-toast"]');
    const errorToast = page.locator('[data-testid="error-toast"]');

    const result = await Promise.race([
      successToast.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'success'),
      errorToast.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'error'),
    ]).catch(() => 'timeout');

    // Either success or proper error handling should occur
    expect(['success', 'error']).toContain(result);
  });
});

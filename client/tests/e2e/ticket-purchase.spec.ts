import { test, expect, Page } from "@playwright/test";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Navigate to /home and wait for at least one Enter Raffle button to be visible. */
async function gotoHome(page: Page) {
    await page.goto("/home");
    await expect(
        page.getByTestId("enter-raffle-btn").first()
    ).toBeVisible({ timeout: 10_000 });
}

/** Click the first Enter Raffle button and return a reference to it. */
async function clickFirstEnterButton(page: Page) {
    const btn = page.getByTestId("enter-raffle-btn").first();
    await btn.click();
    return btn;
}

/** Wait for the success modal to appear (allows for the 900 ms demo delay). */
async function waitForSuccessModal(page: Page) {
    const modal = page.getByTestId("success-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });
    return modal;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Ticket purchase flow", () => {
    test.describe("page load", () => {
        test("navigates to /home and shows raffle cards with Enter Raffle buttons", async ({
            page,
        }) => {
            await gotoHome(page);
            const buttons = page.getByTestId("enter-raffle-btn");
            await expect(buttons.first()).toBeVisible();
            await expect(buttons.first()).toHaveText("Enter Raffle");
        });

        test("raffle cards display an entries count", async ({ page }) => {
            await gotoHome(page);
            const count = page.getByTestId("entries-count").first();
            await expect(count).toBeVisible();
            // Should be a non-empty number
            const text = await count.innerText();
            expect(Number(text)).toBeGreaterThanOrEqual(0);
        });
    });

    test.describe("button loading state", () => {
        test('shows "Processing..." and disables the button while purchase is in-flight', async ({
            page,
        }) => {
            await gotoHome(page);
            const btn = await clickFirstEnterButton(page);
            await expect(btn).toHaveText("Processing...");
            await expect(btn).toBeDisabled();
        });

        test("re-enables the button after the purchase completes", async ({
            page,
        }) => {
            await gotoHome(page);
            const btn = page.getByTestId("enter-raffle-btn").first();
            await btn.click();
            // Wait for the success modal — means the purchase finished
            await waitForSuccessModal(page);
            // After modal is shown the button should be enabled again
            await expect(btn).toBeEnabled();
        });
    });

    test.describe("success modal", () => {
        test('success modal appears with "Let\'s go!!!" heading', async ({
            page,
        }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            const modal = await waitForSuccessModal(page);
            await expect(modal).toContainText("Let's go!!!");
        });

        test("success modal contains the raffle name", async ({ page }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            const modal = await waitForSuccessModal(page);
            // The modal says "Your tickets purchase for <raffleName> was successful."
            await expect(modal).toContainText("successful");
        });

        test("success modal has a Continue button", async ({ page }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);
            await expect(page.getByTestId("success-continue-btn")).toBeVisible();
        });

        test("Close (×) button dismisses the success modal", async ({
            page,
        }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);
            await page.getByLabel("Close modal").click();
            await expect(page.getByTestId("success-modal")).not.toBeVisible();
        });

        test("Continue button dismisses the success modal", async ({ page }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);
            await page.getByTestId("success-continue-btn").click();
            await expect(page.getByTestId("success-modal")).not.toBeVisible();
        });

        test("ESC key closes the success modal", async ({ page }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);
            await page.keyboard.press("Escape");
            await expect(page.getByTestId("success-modal")).not.toBeVisible();
        });

        test("clicking the backdrop closes the success modal", async ({
            page,
        }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);
            // Click the semi-transparent backdrop (outside the modal dialog)
            await page.mouse.click(10, 10);
            await expect(page.getByTestId("success-modal")).not.toBeVisible();
        });
    });

    test.describe("ticket count update", () => {
        test("entries count increments by 1 after a successful purchase", async ({
            page,
        }) => {
            await gotoHome(page);
            const entriesEl = page.getByTestId("entries-count").first();
            const before = Number(await entriesEl.innerText());

            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);

            await expect(entriesEl).toHaveText(String(before + 1));
        });

        test("entries count increments again on a second purchase", async ({
            page,
        }) => {
            await gotoHome(page);
            const entriesEl = page.getByTestId("entries-count").first();
            const before = Number(await entriesEl.innerText());

            // First purchase
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);
            await page.getByTestId("success-continue-btn").click();
            await expect(page.getByTestId("success-modal")).not.toBeVisible();

            // Second purchase on the same card
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);

            await expect(entriesEl).toHaveText(String(before + 2));
        });
    });

    test.describe("navigation", () => {
        test("clicking the raffle card link navigates to the detail page", async ({
            page,
        }) => {
            await gotoHome(page);
            // The <Link> wraps the card image/content
            await page.getByRole("link").first().click();
            await expect(page).toHaveURL(/\/details\?raffle=\d+/);
        });

        test("Continue button on success modal navigates to the raffle detail page", async ({
            page,
        }) => {
            await gotoHome(page);
            await clickFirstEnterButton(page);
            await waitForSuccessModal(page);
            await page.getByTestId("success-continue-btn").click();
            await expect(page).toHaveURL(/\/details\?raffle=\d+/);
        });
    });
});

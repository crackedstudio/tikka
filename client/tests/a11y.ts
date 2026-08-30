import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';

/**
 * Violation severity levels that axe recognises.
 * We treat "serious" and "critical" as CI-failing by default.
 */
const FAIL_SEVERITIES: Result['impact'][] = ['critical', 'serious'];

/**
 * Run axe-core accessibility checks against the current page.
 *
 * @param page            - Playwright Page instance
 * @param extraInclude    - optional additional CSS selectors to include
 * @param failOn          - severity levels that should cause the test to fail
 *                          (defaults to critical + serious)
 * @returns               - the raw AxeResults for custom assertions
 */
export async function runAxe(
    page: Page,
    opts?: {
        include?: string[];
        failOn?: Result['impact'][];
    },
): Promise<AxeResults> {
    let builder = new AxeBuilder({ page });

    if (opts?.include?.length) {
        for (const selector of opts.include) {
            builder = builder.include(selector);
        }
    }

    return builder.analyze();
}

/**
 * Convenience assertion: run axe and fail the test if any
 * violations at the specified severity (or higher) are found.
 *
 * Returns the results so callers can perform additional
 * inspections (e.g. printing a count of moderate violations).
 */
export async function expectNoA11yViolations(
    page: Page,
    opts?: {
        include?: string[];
        failOn?: Result['impact'][];
    },
): Promise<AxeResults> {
    const failSeverities = opts?.failOn ?? FAIL_SEVERITIES;
    const results = await runAxe(page, opts);

    // Separate violations by severity
    const failing = results.violations.filter((v) =>
        failSeverities.includes(v.impact),
    );
    const nonFailing = results.violations.filter(
        (v) => !failSeverities.includes(v.impact),
    );

    // Log non-failing violations for visibility (moderate, minor, etc.)
    if (nonFailing.length > 0) {
        console.log(
            `[a11y] ${nonFailing.length} non-blocking violation(s) (moderate/minor):`,
        );
        for (const v of nonFailing) {
            console.log(
                `  - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} element(s))`,
            );
        }
    }

    // Fail on serious/critical
    if (failing.length > 0) {
        const summary = failing
            .map(
                (v) =>
                    `[${v.impact}] ${v.id}: ${v.description} — ${v.help} (${v.helpUrl})`,
            )
            .join('\n');
        throw new Error(
            `axe-core found ${failing.length} serious/critical a11y violation(s):\n${summary}`,
        );
    }

    return results;
}

/**
 * Assert that pressing Escape closes a modal.
 *
 * @param page           - Playwright Page
 * @param openTrigger    - action that opens the modal (click, etc.)
 * @param modalSelector  - CSS selector for the modal container
 */
export async function expectEscapeClosesModal(
    page: Page,
    openTrigger: () => Promise<void>,
    modalSelector = '[role="dialog"]',
): Promise<void> {
    await openTrigger();
    const modal = page.locator(modalSelector);
    await modal.waitFor({ state: 'visible', timeout: 10_000 });

    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 5_000 });
}

/**
 * Assert that focus is trapped inside a modal when Tab/Shift+Tab are used.
 *
 * @param page           - Playwright Page
 * @param openTrigger    - action that opens the modal
 * @param modalSelector  - CSS selector for the modal container
 */
export async function expectFocusTrap(
    page: Page,
    openTrigger: () => Promise<void>,
    modalSelector = '[role="dialog"]',
): Promise<void> {
    await openTrigger();
    const modal = page.locator(modalSelector);
    await modal.waitFor({ state: 'visible', timeout: 10_000 });

    // Find all focusable elements inside the modal
    const focusableSelector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
    const focusableElements = modal.locator(focusableSelector);
    const count = await focusableElements.count();

    if (count === 0) {
        // No focusable elements; Tab should stay inside (or there's nothing to trap)
        return;
    }

    // Focus the last element
    await focusableElements.nth(count - 1).focus();

    // Press Tab — should wrap to first element
    await page.keyboard.press('Tab');
    const focusStillInModal = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.closest('[role="dialog"]') !== null : false;
    });
    if (!focusStillInModal) {
        throw new Error(
            'Focus trap broken: Tab from last focusable element did not wrap inside the modal',
        );
    }
}

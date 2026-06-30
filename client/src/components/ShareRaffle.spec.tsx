/**
 * ShareRaffle Tests
 *
 * Covers the Web Share API path and the clipboard fallback path
 * using vi.stubGlobal as specified in the requirements.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import ShareRaffle from "./ShareRaffle";

// Mock sonner toast
vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const defaultProps = {
    raffleId: 42,
    title: "Test Raffle",
};
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import ShareRaffle from "./ShareRaffle";

function getFakeNavigator(overrides: Record<string, unknown> = {}) {
    return { ...navigator, share: undefined, clipboard: undefined, ...overrides };
}

describe("ShareRaffle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("calls navigator.share when Web Share API is available", async () => {
        const shareMock = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", {
            ...navigator,
            share: shareMock,
        });

        render(<ShareRaffle {...defaultProps} />);

        fireEvent.click(screen.getByRole("button", { name: "Share" }));

        await waitFor(() => {
            expect(shareMock).toHaveBeenCalledWith({
                title: "Test Raffle",
                text: "Check out this raffle: Test Raffle",
                url: expect.stringContaining("/raffles/42"),
            });
        });
    });

    it("falls back to clipboard copy when Web Share API is not available", async () => {
        const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", {
            ...navigator,
            share: undefined,
            clipboard: { writeText: clipboardWriteMock },
        });
        // Ensure clipboard API is accessible (jsdom defaults to non-secure context)
        vi.stubGlobal("isSecureContext", true);

        render(<ShareRaffle {...defaultProps} />);

        fireEvent.click(screen.getByRole("button", { name: "Share" }));

        await waitFor(() => {
            expect(clipboardWriteMock).toHaveBeenCalledWith(
                expect.stringContaining("/raffles/42"),
            );
        });

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith("Link copied!");
        });
    });

    it("handles AbortError from navigator.share gracefully without showing error toast", async () => {
        const abortError = new DOMException("Share dismissed", "AbortError");
        const shareMock = vi.fn().mockRejectedValue(abortError);
        vi.stubGlobal("navigator", {
            ...navigator,
            share: shareMock,
        });

        render(<ShareRaffle {...defaultProps} />);

        fireEvent.click(screen.getByRole("button", { name: "Share" }));

        await waitFor(() => {
            expect(shareMock).toHaveBeenCalled();
        });

        // Should not show error toast when user dismisses the share sheet
        expect(toast.error).not.toHaveBeenCalled();
    test("calls navigator.share with correct params and handles AbortError silently", async () => {
        const shareFn = vi.fn().mockRejectedValue(
            new DOMException("The user aborted a request.", "AbortError"),
        );
        vi.stubGlobal("navigator", getFakeNavigator({ share: shareFn }));

        render(<ShareRaffle raffleId={42} title="Cool Prize" />);
        fireEvent.click(screen.getByRole("button", { name: /share using your device/i }));

        await new Promise((r) => setTimeout(r, 50));

        expect(shareFn).toHaveBeenCalledWith({
            title: "Cool Prize",
            text: "Check out this raffle: Cool Prize",
            url: expect.stringContaining("/raffles/42"),
        });
        expect(toast.error).not.toHaveBeenCalled();
    });

    test("falls back to clipboard copy when navigator.share is unavailable and shows toast", async () => {
        const writeTextFn = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", getFakeNavigator({ clipboard: { writeText: writeTextFn } }));

        render(<ShareRaffle raffleId={7} title="Another Raffle" />);
        fireEvent.click(screen.getByRole("button", { name: /share using your device/i }));

        await new Promise((r) => setTimeout(r, 50));

        expect(writeTextFn).toHaveBeenCalledWith(
            expect.stringContaining("/raffles/7"),
        );
        expect(toast.success).toHaveBeenCalledWith("Link copied!");
    });
});

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
    });
});

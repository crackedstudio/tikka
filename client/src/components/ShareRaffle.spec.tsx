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

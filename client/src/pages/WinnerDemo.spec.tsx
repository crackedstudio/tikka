import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import WinnerDemo from "./WinnerDemo";
import confetti from "canvas-confetti";
import RaffleWinnerBanner from "../components/RaffleWinnerBanner";

vi.mock("canvas-confetti", () => ({
    default: vi.fn(),
}));

vi.mock("../components/RaffleWinnerBanner", () => ({
    default: vi.fn(({ prizeName, prizeValue, walletAddress }: any) => (
        <div data-testid="winner-banner">
            {prizeName} | {prizeValue} | {walletAddress}
        </div>
    )),
}));

vi.mock("../components/ui/Breadcrumbs", () => ({
    Breadcrumbs: () => <div data-testid="breadcrumbs" />,
}));

describe("WinnerDemo", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockReturnValue({
                matches: false,
                media: "(prefers-reduced-motion: reduce)",
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it("fires confetti, animates the address, and wires share links", () => {
        render(<WinnerDemo />);

        expect(screen.getByTestId("winner-banner")).toBeInTheDocument();
        expect(vi.mocked(confetti)).toHaveBeenCalledTimes(1);

        const bannerProps = vi.mocked(RaffleWinnerBanner).mock.calls[0][0];
        expect(bannerProps).toMatchObject({
            isWinner: true,
            prizeName: "Lamborghini Aventador, Limited Edition 2023",
            prizeValue: "$500,000",
            walletAddress: "0x330cd8fec9c4e5b87c1d4f6a9b2e8c7f",
        });

        act(() => {
            vi.advanceTimersByTime(2500);
        });

        expect(
            screen.getByText("0x330cd8fec9c4e5b87c1d4f6a9b2e8c7f")
        ).toBeInTheDocument();

        const xLink = screen.getByRole("link", { name: /share on x/i });
        const telegramLink = screen.getByRole("link", { name: /share on telegram/i });

        expect(xLink).toHaveAttribute(
            "href",
            expect.stringContaining("I%20just%20won%20Lamborghini%20Aventador")
        );
        expect(telegramLink).toHaveAttribute(
            "href",
            expect.stringContaining("I%20just%20won%20Lamborghini%20Aventador")
        );
    });
});
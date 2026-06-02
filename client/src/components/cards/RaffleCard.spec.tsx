import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import RaffleCard from "./RaffleCard";
import { FALLBACK_IMAGE } from "./raffleCardViewModel";
import type { RaffleCardViewModel } from "./raffleCardViewModel";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../EnterRaffleButton", () => ({
    default: ({
        children,
        onSuccess,
    }: {
        children: React.ReactNode;
        onSuccess?: () => void;
        onError?: (e: string) => void;
    }) => (
        <button data-testid="enter-raffle-btn" onClick={onSuccess}>
            {children}
        </button>
    ),
}));

vi.mock("../ui/ProgressBar", () => ({
    ProgressBar: ({ value }: { value: number }) => (
        <div data-testid="progress-bar" data-value={value} />
    ),
}));

vi.mock("../../assets/svg/Line", () => ({
    default: () => <hr data-testid="line-divider" />,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

const SEVEN_DAYS = Math.floor(Date.now() / 1000) + 7 * 86400;
const ONE_HOUR = Math.floor(Date.now() / 1000) + 3600;

function buildVm(overrides: Partial<RaffleCardViewModel> = {}): RaffleCardViewModel {
    return {
        raffleId: 42,
        title: "Win a MacBook Pro",
        description: "An amazing MacBook Pro raffle.",
        imageUrl: "https://example.com/prize.jpg",
        status: "live",
        statusLabel: "Live",
        ticketPrice: "10.000 XLM",
        ticketAsset: "XLM",
        prizeValue: "3000",
        prizeCurrency: "XLM",
        entries: 250,
        maxTickets: 500,
        progress: 50,
        endTimeUnix: SEVEN_DAYS,
        countdown: { days: "07", hours: "00", minutes: "00", seconds: "00" },
        winner: null,
        buttonText: "Enter Raffle",
        ...overrides,
    };
}

const renderCard = (vm: RaffleCardViewModel, onEnter?: () => void) =>
    render(
        <MemoryRouter>
            <RaffleCard viewModel={vm} onEnter={onEnter} />
        </MemoryRouter>
    );

// ── Scenario: live raffle ──────────────────────────────────────────────────────

describe("RaffleCard — live raffle", () => {
    it("renders the raffle title", () => {
        renderCard(buildVm());
        expect(screen.getByText("Win a MacBook Pro")).toBeInTheDocument();
    });

    it("renders prize value and currency", () => {
        renderCard(buildVm());
        expect(screen.getByText("3000 XLM")).toBeInTheDocument();
    });

    it("renders the 'Live' status badge", () => {
        renderCard(buildVm());
        expect(screen.getByTestId("status-badge")).toHaveTextContent("Live");
    });

    it("renders the countdown segments", () => {
        renderCard(buildVm());
        expect(screen.getByText("07d")).toBeInTheDocument();
        expect(screen.getByText("00h")).toBeInTheDocument();
        expect(screen.getByText("00m")).toBeInTheDocument();
        expect(screen.getByText("00s")).toBeInTheDocument();
    });

    it("renders 'Ends In' label", () => {
        renderCard(buildVm());
        expect(screen.getByText("Ends In")).toBeInTheDocument();
    });

    it("renders the ticket price", () => {
        renderCard(buildVm());
        expect(screen.getByText("10.000 XLM")).toBeInTheDocument();
    });

    it("renders the entry count", () => {
        renderCard(buildVm());
        expect(screen.getByTestId("entries-count")).toHaveTextContent("250");
    });

    it("renders the progress bar with correct value", () => {
        renderCard(buildVm());
        expect(screen.getByTestId("progress-bar")).toHaveAttribute("data-value", "50");
    });

    it("renders the EnterRaffleButton for active raffles", () => {
        renderCard(buildVm());
        expect(screen.getByTestId("enter-raffle-btn")).toBeInTheDocument();
        expect(screen.getByTestId("enter-raffle-btn")).toHaveTextContent("Enter Raffle");
    });

    it("calls onEnter when the EnterRaffleButton fires onSuccess", () => {
        const onEnter = vi.fn();
        renderCard(buildVm(), onEnter);
        fireEvent.click(screen.getByTestId("enter-raffle-btn"));
        expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it("does not show status-button (disabled CTA) for an active raffle", () => {
        renderCard(buildVm());
        expect(screen.queryByTestId("status-button")).not.toBeInTheDocument();
    });

    it("renders a Link to /raffles/:id", () => {
        renderCard(buildVm());
        expect(screen.getByRole("link")).toHaveAttribute("href", "/raffles/42");
    });

    it("does not render a winner address", () => {
        renderCard(buildVm());
        expect(screen.queryByTestId("winner-address")).not.toBeInTheDocument();
    });
});

// ── Scenario: ending-soon raffle ──────────────────────────────────────────────

describe("RaffleCard — ending-soon raffle", () => {
    const vm = buildVm({
        status: "ending-soon",
        statusLabel: "Ending Soon",
        endTimeUnix: ONE_HOUR,
        countdown: { days: "00", hours: "01", minutes: "00", seconds: "00" },
    });

    it("renders the 'Ending Soon' status badge", () => {
        renderCard(vm);
        expect(screen.getByTestId("status-badge")).toHaveTextContent("Ending Soon");
    });

    it("still shows the countdown for an ending-soon raffle", () => {
        renderCard(vm);
        expect(screen.getByText("00d")).toBeInTheDocument();
        expect(screen.getByText("01h")).toBeInTheDocument();
    });

    it("still shows the EnterRaffleButton", () => {
        renderCard(vm);
        expect(screen.getByTestId("enter-raffle-btn")).toBeInTheDocument();
    });
});

// ── Scenario: finalized raffle ────────────────────────────────────────────────

describe("RaffleCard — finalized raffle", () => {
    const WINNER = "GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456";
    const vm = buildVm({
        status: "finalized",
        statusLabel: "Finalized",
        buttonText: "View Winner",
        winner: WINNER,
    });

    it("renders the 'Finalized' status badge", () => {
        renderCard(vm);
        expect(screen.getByTestId("status-badge")).toHaveTextContent("Finalized");
    });

    it("does NOT show the countdown", () => {
        renderCard(vm);
        expect(screen.queryByText("Ends In")).not.toBeInTheDocument();
    });

    it("shows a truncated winner address", () => {
        renderCard(vm);
        const addr = screen.getByTestId("winner-address");
        expect(addr).toBeInTheDocument();
        expect(addr.textContent).toContain("GABC");
        expect(addr.textContent).toContain("123456");
    });

    it("shows a disabled 'View Winner' button (not EnterRaffleButton)", () => {
        renderCard(vm);
        expect(screen.queryByTestId("enter-raffle-btn")).not.toBeInTheDocument();
        const btn = screen.getByTestId("status-button");
        expect(btn).toBeDisabled();
        expect(btn).toHaveTextContent("View Winner");
    });
});

// ── Scenario: cancelled raffle ────────────────────────────────────────────────

describe("RaffleCard — cancelled raffle", () => {
    const vm = buildVm({
        status: "cancelled",
        statusLabel: "Cancelled",
        buttonText: "Cancelled",
        winner: null,
    });

    it("renders the 'Cancelled' status badge", () => {
        renderCard(vm);
        expect(screen.getByTestId("status-badge")).toHaveTextContent("Cancelled");
    });

    it("does NOT show the countdown", () => {
        renderCard(vm);
        expect(screen.queryByText("Ends In")).not.toBeInTheDocument();
    });

    it("does NOT show a winner address", () => {
        renderCard(vm);
        expect(screen.queryByTestId("winner-address")).not.toBeInTheDocument();
    });

    it("shows a disabled 'Cancelled' button", () => {
        renderCard(vm);
        const btn = screen.getByTestId("status-button");
        expect(btn).toBeDisabled();
        expect(btn).toHaveTextContent("Cancelled");
    });

    it("does not render EnterRaffleButton", () => {
        renderCard(vm);
        expect(screen.queryByTestId("enter-raffle-btn")).not.toBeInTheDocument();
    });
});

// ── Scenario: missing image (fallback) ────────────────────────────────────────

describe("RaffleCard — missing image", () => {
    it("renders the fallback image when imageUrl equals FALLBACK_IMAGE", () => {
        const vm = buildVm({ imageUrl: FALLBACK_IMAGE });
        renderCard(vm);
        const img = screen.getByAltText("Raffle") as HTMLImageElement;
        expect(img.src).toBe(FALLBACK_IMAGE);
    });

    it("still renders an img element (no broken layout) when imageUrl is the fallback", () => {
        renderCard(buildVm({ imageUrl: FALLBACK_IMAGE }));
        expect(screen.getByAltText("Raffle")).toBeInTheDocument();
    });
});

// ── General rendering ─────────────────────────────────────────────────────────

describe("RaffleCard — shared layout", () => {
    it("renders the 'Prize Value:' label", () => {
        renderCard(buildVm());
        expect(screen.getByText("Prize Value:")).toBeInTheDocument();
    });

    it("renders the 'Ticket price' label", () => {
        renderCard(buildVm());
        expect(screen.getByText("Ticket price")).toBeInTheDocument();
    });

    it("renders the 'Entries' label", () => {
        renderCard(buildVm());
        expect(screen.getByText("Entries")).toBeInTheDocument();
    });

    it("clicking the image area does not trigger onEnter", () => {
        const onEnter = vi.fn();
        renderCard(buildVm(), onEnter);
        fireEvent.click(screen.getByAltText("Raffle"));
        expect(onEnter).not.toHaveBeenCalled();
    });

    it("does not throw when onEnter is undefined and button fires", () => {
        renderCard(buildVm());
        expect(() => fireEvent.click(screen.getByTestId("enter-raffle-btn"))).not.toThrow();
    });
});

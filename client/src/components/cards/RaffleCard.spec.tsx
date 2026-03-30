import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import RaffleCard from "./RaffleCard";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../EnterRaffleButton", () => ({
    default: ({
        children,
        onSuccess,
        onError,
    }: {
        children: React.ReactNode;
        onSuccess?: () => void;
        onError?: (e: string) => void;
    }) => (
        <button
            data-testid="enter-raffle-btn"
            onClick={onSuccess}
            data-on-error={onError ? "present" : "absent"}
        >
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

const baseProps = {
    image: "https://example.com/prize.jpg",
    title: "Win a MacBook Pro",
    prizeValue: "3000",
    prizeCurrency: "XLM",
    countdown: { days: "02", hours: "14", minutes: "30", seconds: "05" },
    ticketPrice: "10 XLM",
    entries: 250,
    progress: 50,
};

const renderCard = (props: Partial<typeof baseProps> & { raffleId?: number; onEnter?: () => void; buttonText?: string } = {}) =>
    render(
        <MemoryRouter>
            <RaffleCard {...baseProps} {...props} />
        </MemoryRouter>
    );

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("RaffleCard", () => {
    describe("rendering: title, price, and status", () => {
        it("renders the raffle title", () => {
            renderCard();
            expect(screen.getByText("Win a MacBook Pro")).toBeInTheDocument();
        });

        it("renders prize value and currency", () => {
            renderCard();
            expect(screen.getByText("3000 XLM")).toBeInTheDocument();
        });

        it("defaults prizeCurrency to ETH when not provided", () => {
            renderCard({ prizeCurrency: undefined });
            expect(screen.getByText(/3000 ETH/)).toBeInTheDocument();
        });

        it("renders ticket price", () => {
            renderCard();
            expect(screen.getByText("10 XLM")).toBeInTheDocument();
        });

        it("renders entry count", () => {
            renderCard();
            expect(screen.getByText("250")).toBeInTheDocument();
        });

        it("renders countdown segments", () => {
            renderCard();
            expect(screen.getByText("02d")).toBeInTheDocument();
            expect(screen.getByText("14h")).toBeInTheDocument();
            expect(screen.getByText("30m")).toBeInTheDocument();
            expect(screen.getByText("05s")).toBeInTheDocument();
        });

        it("renders the progress bar with correct value", () => {
            renderCard();
            const bar = screen.getByTestId("progress-bar");
            expect(bar).toBeInTheDocument();
            expect(bar).toHaveAttribute("data-value", "50");
        });

        it("renders the default button label when buttonText is not provided", () => {
            renderCard({ raffleId: 1 });
            expect(screen.getByTestId("enter-raffle-btn")).toHaveTextContent(
                "Enter Raffle"
            );
        });

        it("renders a custom buttonText", () => {
            renderCard({ raffleId: 1, buttonText: "Buy Ticket" });
            expect(screen.getByTestId("enter-raffle-btn")).toHaveTextContent(
                "Buy Ticket"
            );
        });
    });

    describe("image handling", () => {
        it("renders the image with correct src", () => {
            renderCard();
            const img = screen.getByAltText("Raffle") as HTMLImageElement;
            expect(img).toBeInTheDocument();
            expect(img.src).toBe("https://example.com/prize.jpg");
        });

        it("renders image element even when src is an empty string", () => {
            renderCard({ image: "" });
            const img = screen.getByAltText("Raffle") as HTMLImageElement;
            expect(img).toBeInTheDocument();
            expect(img.src).toBe("http://localhost:3000/");
        });

        it("renders image element when src is a relative path", () => {
            renderCard({ image: "/images/local-prize.jpg" });
            const img = screen.getByAltText("Raffle") as HTMLImageElement;
            expect(img.getAttribute("src")).toBe("/images/local-prize.jpg");
        });
    });

    describe("navigation (with raffleId)", () => {
        it("renders a Link to /raffles/:id when raffleId is provided", () => {
            renderCard({ raffleId: 42 });
            const link = screen.getByRole("link");
            expect(link).toHaveAttribute("href", "/raffles/42");
        });

        it("renders EnterRaffleButton (not a plain button) when raffleId is provided", () => {
            renderCard({ raffleId: 42 });
            expect(screen.getByTestId("enter-raffle-btn")).toBeInTheDocument();
        });
    });

    describe("no-navigation mode (without raffleId)", () => {
        it("renders no anchor link when raffleId is omitted", () => {
            renderCard();
            expect(screen.queryByRole("link")).not.toBeInTheDocument();
        });

        it("renders a plain button when raffleId is omitted", () => {
            renderCard();
            const btn = screen.getByRole("button");
            expect(btn).toBeInTheDocument();
            expect(btn).toHaveTextContent("Enter Raffle");
        });

        it("calls onEnter when the plain button is clicked", () => {
            const onEnter = vi.fn();
            renderCard({ onEnter });
            fireEvent.click(screen.getByRole("button"));
            expect(onEnter).toHaveBeenCalledTimes(1);
        });

        it("does not throw when onEnter is undefined and button is clicked", () => {
            renderCard();
            expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
        });
    });

    describe("click behavior (with raffleId)", () => {
        it("calls onEnter after EnterRaffleButton fires onSuccess", () => {
            const onEnter = vi.fn();
            renderCard({ raffleId: 7, onEnter });
            fireEvent.click(screen.getByTestId("enter-raffle-btn"));
            expect(onEnter).toHaveBeenCalledTimes(1);
        });

        it("clicking the link area does not bubble into the button", () => {
            const onEnter = vi.fn();
            renderCard({ raffleId: 7, onEnter });
            // Clicking the card image/link should NOT trigger onEnter
            fireEvent.click(screen.getByAltText("Raffle"));
            expect(onEnter).not.toHaveBeenCalled();
        });
    });

    describe("structural layout", () => {
        it("renders the 'Prize Value:' label", () => {
            renderCard();
            expect(screen.getByText("Prize Value:")).toBeInTheDocument();
        });

        it("renders the 'Ticket price' label", () => {
            renderCard();
            expect(screen.getByText("Ticket price")).toBeInTheDocument();
        });

        it("renders the 'Entries' label", () => {
            renderCard();
            expect(screen.getByText("Entries")).toBeInTheDocument();
        });

        it("renders the 'Ends In' label", () => {
            renderCard();
            expect(screen.getByText("Ends In")).toBeInTheDocument();
        });

        it("renders divider lines", () => {
            renderCard();
            expect(screen.getAllByTestId("line-divider").length).toBeGreaterThanOrEqual(1);
        });
    });
});

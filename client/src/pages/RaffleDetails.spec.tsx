import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import RaffleDetails from "./RaffleDetails";
import * as useRaffleDetailsDataHook from "../hooks/useRaffleDetailsData";
import * as walletProvider from "../providers/WalletProvider";
import type { FormattedRaffle } from "../types/types";

// Mock the hook module
vi.mock("../hooks/useRaffleDetailsData");

// Mock WalletProvider
vi.mock("../providers/WalletProvider", () => ({
    useWalletContext: vi.fn(),
}));

// Mock child components
vi.mock("../components/cards/RaffleDetailsCard", () => ({
    default: ({ title }: any) => <div data-testid="raffle-details-card">{title}</div>,
}));

vi.mock("../components/RaffleMetadataSection", () => ({
    default: () => <div data-testid="metadata-section">Metadata</div>,
}));

vi.mock("../components/RaffleTicketPurchaseSection", () => ({
    default: () => <div data-testid="purchase-section">Purchase</div>,
}));

vi.mock("../components/RaffleNotificationSection", () => ({
    default: () => <div data-testid="notification-section">Notification</div>,
}));

vi.mock("../components/RaffleWinnerBanner", () => ({
    default: () => <div data-testid="winner-banner">Winner</div>,
}));

vi.mock("../components/ShareRaffle", () => ({
    default: () => <div data-testid="share-section">Share</div>,
}));

vi.mock("../components/VerifiedBadge", () => ({
    default: () => <div data-testid="verified-badge">Verified</div>,
}));

vi.mock("../components/ui/Breadcrumbs", () => ({
    Breadcrumbs: () => <div data-testid="breadcrumbs">Breadcrumbs</div>,
}));

vi.mock("../components/ui/ErrorMessage", () => ({
    default: ({ title, message }: any) => (
        <div data-testid="error-message">
            <h2>{title}</h2>
            <p>{message}</p>
        </div>
    ),
}));

vi.mock("react-helmet-async", () => ({
    Helmet: ({ children }: any) => <div>{children}</div>,
}));

const mockRaffle: FormattedRaffle = {
    id: 1,
    description: "Test Raffle",
    status: "active",
    ticketPrice: 100,
    ticketPriceFormatted: "100 XLM",
    prizeValue: 1000,
    prizeCurrency: "XLM",
    endTime: Math.floor(Date.now() / 1000) + 86400,
    totalTicketsSold: 50,
    maxTickets: 100,
    image: "test.jpg",
    metadata: {
        title: "Test Raffle",
        category: "General",
    },
};

const renderWithProviders = (component: React.ReactElement) => {
    return render(
        <HelmetProvider>
            <BrowserRouter>
                {component}
            </BrowserRouter>
        </HelmetProvider>
    );
};

describe("RaffleDetails Page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(walletProvider.useWalletContext).mockReturnValue({
            address: "GBZ3KSBF2U5YNHZJ4H5XQHZ5KSBF2U5",
            isConnected: true,
            connect: vi.fn(),
            disconnect: vi.fn(),
            signTransaction: vi.fn(),
        } as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should display loading state initially", () => {
        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: null,
            error: null,
            isLoading: true,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        const skeleton = screen.getByRole("region");
        expect(skeleton).toHaveClass("animate-pulse");
    });

    it("should display error state when raffle not found", async () => {
        const mockError = new Error("Raffle not found");
        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: null,
            error: mockError,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("error-message")).toBeInTheDocument();
            expect(screen.getByText("Raffle Not Found")).toBeInTheDocument();
        });
    });

    it("should display error state when raffle is null", async () => {
        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: null,
            error: null,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("error-message")).toBeInTheDocument();
        });
    });

    it("should display success state with active raffle", async () => {
        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: mockRaffle,
            error: null,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("raffle-details-card")).toBeInTheDocument();
            expect(screen.getByTestId("metadata-section")).toBeInTheDocument();
            expect(screen.getByTestId("purchase-section")).toBeInTheDocument();
            expect(screen.getByTestId("notification-section")).toBeInTheDocument();
            expect(screen.getByTestId("share-section")).toBeInTheDocument();
            expect(screen.getByTestId("verified-badge")).toBeInTheDocument();
        });
    });

    it("should display all sections on successful load", async () => {
        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: mockRaffle,
            error: null,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("breadcrumbs")).toBeInTheDocument();
            expect(screen.getByTestId("raffle-details-card")).toBeInTheDocument();
            expect(screen.getByTestId("metadata-section")).toBeInTheDocument();
            expect(screen.getByTestId("purchase-section")).toBeInTheDocument();
            expect(screen.getByTestId("notification-section")).toBeInTheDocument();
        });
    });

    it("should display purchase disabled state for closed raffle", async () => {
        const closedRaffle = {
            ...mockRaffle,
            status: "closed",
        };

        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: closedRaffle,
            error: null,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("purchase-section")).toBeInTheDocument();
            expect(screen.getByTestId("metadata-section")).toBeInTheDocument();
        });
    });

    it("should handle purchase success by refetching", async () => {
        const refetchMock = vi.fn();
        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: mockRaffle,
            error: null,
            isLoading: false,
            refetch: refetchMock,
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("purchase-section")).toBeInTheDocument();
        });
    });

    it("should display winner banner when user is winner", async () => {
        const winningRaffle = {
            ...mockRaffle,
            winner: "GBZ3KSBF2U5YNHZJ4H5XQHZ5KSBF2U5",
            status: "finalized",
        };

        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: winningRaffle,
            error: null,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("winner-banner")).toBeInTheDocument();
        });
    });

    it("should not display winner banner when user is not winner", async () => {
        const winningRaffle = {
            ...mockRaffle,
            winner: "OTHER_ADDRESS",
            status: "finalized",
        };

        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: winningRaffle,
            error: null,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.queryByTestId("winner-banner")).not.toBeInTheDocument();
        });
    });

    it("should set document title with raffle metadata", async () => {
        vi.mocked(useRaffleDetailsDataHook.useRaffleDetailsData).mockReturnValue({
            raffle: mockRaffle,
            error: null,
            isLoading: false,
            refetch: vi.fn(),
        });

        renderWithProviders(<RaffleDetails />);

        await waitFor(() => {
            expect(screen.getByTestId("raffle-details-card")).toBeInTheDocument();
        });
    });
});

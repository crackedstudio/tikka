/**
 * Leaderboard Component Tests
 * 
 * Tests loading, error, and empty states of the Leaderboard component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Leaderboard from "./Leaderboard";
import * as leaderboardService from "../services/leaderboardService";

// Mock the useLeaderboard hook
vi.mock("../hooks/useLeaderboard", () => ({
  useLeaderboard: vi.fn(),
}));

import { useLeaderboard } from "../hooks/useLeaderboard";

describe("Leaderboard Component", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const mockRefetch = vi.fn();

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Leaderboard />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  describe("Loading State", () => {
    it("should render skeleton/loading spinner while data is loading", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should show loading indicator
      const loadingText = screen.getByText(/loading leaderboard/i);
      expect(loadingText).toBeInTheDocument();

      // Should show loading spinner
      const spinner = screen.getByRole("img", { hidden: true }) || document.querySelector(".animate-spin");
      expect(spinner).toBeTruthy();
    });

    it("should not render table while loading", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // Table should not be visible
      const table = document.querySelector("table");
      expect(table).not.toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("should render error message when request fails", () => {
      const mockError = new Error("Failed to fetch leaderboard");
      
      vi.mocked(useLeaderboard).mockReturnValue({
        data: null,
        isLoading: false,
        error: mockError as any,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should show error title
      const errorTitle = screen.getByText(/error loading leaderboard/i);
      expect(errorTitle).toBeInTheDocument();

      // Should show error message
      const errorMessage = screen.getByText(/failed to fetch leaderboard/i);
      expect(errorMessage).toBeInTheDocument();
    });

    it("should render retry button on error", () => {
      const mockError = new Error("Failed to fetch");
      
      vi.mocked(useLeaderboard).mockReturnValue({
        data: null,
        isLoading: false,
        error: mockError as any,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should show retry button
      const retryButton = screen.getByRole("button", { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("should render empty state when no participants", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: { entries: [] },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should show empty state title
      const emptyTitle = screen.getByText(/no leaderboard data yet/i);
      expect(emptyTitle).toBeInTheDocument();

      // Should show empty state message
      const emptyMessage = screen.getByText(/leaderboard will populate/i);
      expect(emptyMessage).toBeInTheDocument();

      // Should not render table
      const table = document.querySelector("table");
      expect(table).not.toBeInTheDocument();
    });

    it("should show empty state icon", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: { entries: [] },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should render icon (SVG)
      const svgIcon = document.querySelector("svg");
      expect(svgIcon).toBeInTheDocument();
    });
  });

  describe("Success State - Data Loaded", () => {
    const mockLeaderboardData = {
      entries: [
        {
          address: "GBDS45Y7JYFZ73RFGBVHQKW3L6K7WQBHXMZFXEZH6ZP54CNXVD3YQMXF",
          total_wins: 5,
          total_volume_xlm: "100.5",
          total_tickets: 50,
          rank: 1,
        },
        {
          address: "GDZST3XVCDTUJ76ZAV2HA72KYXM4Y6H32MFZVGZ7LQQGUHTZPXN3S3OY",
          total_wins: 3,
          total_volume_xlm: "75.2",
          total_tickets: 30,
          rank: 2,
        },
      ],
    };

    it("should render leaderboard table with participants", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: mockLeaderboardData,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should render table
      const table = document.querySelector("table");
      expect(table).toBeInTheDocument();

      // Should render table headers
      expect(screen.getByText(/rank/i)).toBeInTheDocument();
      expect(screen.getByText(/address/i)).toBeInTheDocument();
    });

    it("should display participant data correctly", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: mockLeaderboardData,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should show shortened addresses
      expect(screen.getByText(/GBDS45...YQMXF/)).toBeInTheDocument();
      expect(screen.getByText(/GDZST3...N3S3OY/)).toBeInTheDocument();

      // Should show ranks
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("should render sort buttons and update sort", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: mockLeaderboardData,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // Should show all sort buttons
      const winsButton = screen.getByRole("button", { name: /by wins/i });
      const volumeButton = screen.getByRole("button", { name: /by volume/i });
      const ticketsButton = screen.getByRole("button", { name: /by tickets/i });

      expect(winsButton).toBeInTheDocument();
      expect(volumeButton).toBeInTheDocument();
      expect(ticketsButton).toBeInTheDocument();
    });

    it("should display correct column based on sort type", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: mockLeaderboardData,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      // By default, should show "Wins" column (sorted by wins)
      const winsHeader = screen.getByText(/wins/i);
      expect(winsHeader).toBeInTheDocument();
    });

    it("should link to Stellar Expert explorer", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: mockLeaderboardData,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      const links = screen.getAllByRole("link");
      
      // Check that at least one link points to stellar.expert
      const stellarLinks = links.filter((link) =>
        (link as HTMLAnchorElement).href.includes("stellar.expert")
      );
      expect(stellarLinks.length).toBeGreaterThan(0);
    });
  });

  describe("Title and Header", () => {
    it("should render page title", () => {
      vi.mocked(useLeaderboard).mockReturnValue({
        data: { entries: [] },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      const title = screen.getByRole("heading", { level: 1, name: /leaderboard/i });
      expect(title).toBeInTheDocument();
    });
  });
});

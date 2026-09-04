/**
 * Search Page Component Tests
 * 
 * Tests loading, error, and empty states for search results
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SearchPage from "./Search";

// Mock the useSearch hook
vi.mock("../hooks/useSearch", () => ({
  useSearch: vi.fn(),
}));

import { useSearch } from "../hooks/useSearch";

// Mock react-router-dom hooks
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [
      new URLSearchParams("q=test"),
      vi.fn(),
    ],
  };
});

describe("SearchPage Component", () => {
  const mockUseSearch = vi.mocked(useSearch);

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading State", () => {
    it("should render skeleton placeholders while searching", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: true,
        error: null,
      });

      renderComponent();

      // Should render 3 RaffleCardSkeleton components
      const skeletons = document.querySelectorAll("[class*='skeleton']") || 
                       document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("should not show results while loading", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: true,
        error: null,
      });

      renderComponent();

      // Should not show empty state
      expect(screen.queryByText(/no raffles found/i)).not.toBeInTheDocument();
      
      // Should not show error
      expect(screen.queryByText(/search failed/i)).not.toBeInTheDocument();
    });

    it("should display loading state for multiple skeleton cards", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: true,
        error: null,
      });

      renderComponent();

      // Grid should be rendered (for skeleton cards)
      const grid = document.querySelector(".grid");
      expect(grid).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("should render error message when search fails", () => {
      const mockError = new Error("Failed to search raffles");
      
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: mockError,
      });

      renderComponent();

      // Should show error title
      const errorTitle = screen.getByText(/search failed/i);
      expect(errorTitle).toBeInTheDocument();

      // Should show error message
      const errorMessage = screen.getByText(/failed to search raffles/i);
      expect(errorMessage).toBeInTheDocument();
    });

    it("should not show results when error occurs", () => {
      const mockError = new Error("Network error");
      
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: mockError,
      });

      renderComponent();

      // Should not show empty state
      expect(screen.queryByText(/no raffles found/i)).not.toBeInTheDocument();
      
      // Results grid should not be rendered
      const resultsGrid = document.querySelector(".grid:has(> [class*='RaffleCard'])");
      expect(resultsGrid).not.toBeInTheDocument();
    });

    it("should display error icon", () => {
      const mockError = new Error("Search error");
      
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: mockError,
      });

      renderComponent();

      // Check for AlertCircle icon or similar error indicator
      const icons = document.querySelectorAll("svg");
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe("Empty State", () => {
    it("should show empty state when no results found", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should show empty state title
      const emptyTitle = screen.getByText(/no raffles found/i);
      expect(emptyTitle).toBeInTheDocument();
    });

    it("should show Search icon in empty state", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should render Search icon (from lucide-react)
      const icons = document.querySelectorAll("svg");
      expect(icons.length).toBeGreaterThan(0);
    });

    it("should show descriptive hint when query is present", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should show hint mentioning the search query
      const hint = screen.getByText(/couldn't find anything matching/i);
      expect(hint).toBeInTheDocument();
    });

    it("should show Browse All Raffles action button", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should show action button
      const actionButton = screen.getByRole("button", { name: /browse all raffles/i });
      expect(actionButton).toBeInTheDocument();
    });

    it("should not show results grid when empty", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Results grid with raffle cards should not be present
      const resultCards = screen.queryByTestId("raffle-card");
      expect(resultCards).not.toBeInTheDocument();
    });
  });

  describe("Success State - With Results", () => {
    const mockResults = [
      {
        id: 1,
        title: "Gaming Console Raffle",
        ticketPrice: "10",
        maxTickets: 100,
        ticketsSold: 50,
        endTime: Date.now() + 86400000, // 1 day from now
        status: 1, // OPEN
      },
      {
        id: 2,
        title: "NFT Art Raffle",
        ticketPrice: "5",
        maxTickets: 200,
        ticketsSold: 150,
        endTime: Date.now() + 172800000, // 2 days from now
        status: 1, // OPEN
      },
    ];

    it("should render results grid when raffles found", () => {
      mockUseSearch.mockReturnValue({
        results: mockResults,
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should render grid container
      const grid = document.querySelector(".grid");
      expect(grid).toBeInTheDocument();
    });

    it("should not show empty state when results exist", () => {
      mockUseSearch.mockReturnValue({
        results: mockResults,
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should not show empty state
      expect(screen.queryByText(/no raffles found/i)).not.toBeInTheDocument();
    });

    it("should not show error when results are loaded", () => {
      mockUseSearch.mockReturnValue({
        results: mockResults,
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should not show error
      expect(screen.queryByText(/search failed/i)).not.toBeInTheDocument();
    });
  });

  describe("Page Header and Filters", () => {
    it("should render search title with query", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      const title = screen.getByRole("heading", { level: 1 });
      expect(title).toBeInTheDocument();
      expect(title.textContent).toContain("test"); // From mocked search params
    });

    it("should render sort options", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should show sort buttons
      expect(screen.getByRole("button", { name: /relevance/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ending soon/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /price/i })).toBeInTheDocument();
    });

    it("should render category filters", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should show some category buttons
      expect(screen.getByRole("button", { name: /gaming/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /electronics/i })).toBeInTheDocument();
    });

    it("should render breadcrumbs", () => {
      mockUseSearch.mockReturnValue({
        results: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      // Should show breadcrumbs with Home and Explore
      expect(screen.getByText(/home/i)).toBeInTheDocument();
      expect(screen.getByText(/explore/i)).toBeInTheDocument();
    });
  });
});

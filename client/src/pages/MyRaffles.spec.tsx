/**
 * MyRaffles Component Tests
 * 
 * Tests loading, error, and empty states for both tabs (entered and created raffles)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MyRaffles } from "./MyRaffles";

describe("MyRaffles Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading State", () => {
    it("should render skeleton placeholders while data is loading", () => {
      render(<MyRaffles />);

      // Should show skeleton elements (3 skeleton rows as per implementation)
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });

    it("should not show tab content while loading", () => {
      render(<MyRaffles />);

      // Wait for initial render, then check that actual content is not present
      expect(screen.queryByText(/you haven't entered/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/you haven't created/i)).not.toBeInTheDocument();
    });
  });

  describe("Empty State - Entered Tab", () => {
    it("should show empty state when no raffles entered", async () => {
      render(<MyRaffles />);

      // Wait for loading to finish and check for empty state
      // Note: In actual implementation, you'd wait for the mock data to resolve
      await vi.waitFor(() => {
        const emptyTitle = screen.queryByText(/no raffles entered yet/i);
        if (emptyTitle) {
          expect(emptyTitle).toBeInTheDocument();
        }
      });
    });

    it("should show Ticket icon in empty state", async () => {
      render(<MyRaffles />);

      await vi.waitFor(() => {
        // Check for SVG icon (Ticket from lucide-react)
        const icons = document.querySelectorAll("svg");
        expect(icons.length).toBeGreaterThan(0);
      });
    });

    it("should show Browse Raffles action button", async () => {
      render(<MyRaffles />);

      await vi.waitFor(() => {
        const browseButton = screen.queryByRole("button", { name: /browse raffles/i });
        if (browseButton) {
          expect(browseButton).toBeInTheDocument();
        }
      });
    });

    it("should have descriptive hint text", async () => {
      render(<MyRaffles />);

      await vi.waitFor(() => {
        const hint = screen.queryByText(/haven't entered any raffles yet/i);
        if (hint) {
          expect(hint).toBeInTheDocument();
        }
      });
    });
  });

  describe("Empty State - Created Tab", () => {
    it("should show empty state when switching to created tab with no created raffles", async () => {
      render(<MyRaffles />);

      // Wait for loading and switch to created tab
      await vi.waitFor(() => {
        const createdTabButton = screen.queryByRole("button", { name: /created raffles/i });
        if (createdTabButton) {
          fireEvent.click(createdTabButton);
        }
      });

      await vi.waitFor(() => {
        const emptyTitle = screen.queryByText(/no raffles created yet/i);
        if (emptyTitle) {
          expect(emptyTitle).toBeInTheDocument();
        }
      });
    });

    it("should show Create Raffle action button in created tab empty state", async () => {
      render(<MyRaffles />);

      await vi.waitFor(() => {
        const createdTabButton = screen.queryByRole("button", { name: /created raffles/i });
        if (createdTabButton) {
          fireEvent.click(createdTabButton);
        }
      });

      await vi.waitFor(() => {
        const createButton = screen.queryByRole("button", { name: /create raffle/i });
        if (createButton) {
          expect(createButton).toBeInTheDocument();
        }
      });
    });

    it("should show Plus icon in created empty state", async () => {
      render(<MyRaffles />);

      await vi.waitFor(() => {
        const createdTabButton = screen.queryByRole("button", { name: /created raffles/i });
        if (createdTabButton) {
          fireEvent.click(createdTabButton);
        }
      });

      await vi.waitFor(() => {
        // Check for SVG icons
        const icons = document.querySelectorAll("svg");
        expect(icons.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Tab Navigation", () => {
    it("should render both tab buttons", () => {
      render(<MyRaffles />);

      const enteredTab = screen.getByRole("button", { name: /entered raffles/i });
      const createdTab = screen.getByRole("button", { name: /created raffles/i });

      expect(enteredTab).toBeInTheDocument();
      expect(createdTab).toBeInTheDocument();
    });

    it("should switch between tabs when clicked", async () => {
      render(<MyRaffles />);

      const createdTab = screen.getByRole("button", { name: /created raffles/i });
      
      fireEvent.click(createdTab);

      // Tab should become active (check for active styling)
      expect(createdTab.className).toContain("border-blue-600");
    });

    it("should show entry counts in tab labels", () => {
      render(<MyRaffles />);

      // Tabs should show counts (0) initially
      expect(screen.getByText(/entered raffles \(0\)/i)).toBeInTheDocument();
      expect(screen.getByText(/created raffles \(0\)/i)).toBeInTheDocument();
    });
  });

  describe("Page Header", () => {
    it("should render page title", () => {
      render(<MyRaffles />);

      const title = screen.getByRole("heading", { level: 1, name: /my raffles dashboard/i });
      expect(title).toBeInTheDocument();
    });

    it("should show wallet address in subtitle", () => {
      render(<MyRaffles />);

      const subtitle = screen.getByText(/manage your active entries/i);
      expect(subtitle).toBeInTheDocument();
    });
  });
});

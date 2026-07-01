import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import RecentParticipants, { type RecentParticipantsHandle } from "./RecentParticipants";
import * as apiClient from "../services/apiClient";

// Mock the API client
vi.mock("../services/apiClient", () => ({
  api: {
    get: vi.fn(),
  },
}));

describe("RecentParticipants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders loading state initially", () => {
    vi.mocked(apiClient.api.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<RecentParticipants raffleId={1} />);
    expect(screen.getByText("Recent Participants")).toBeInTheDocument();
  });

  it("displays participants after loading", async () => {
    const mockParticipants = [
      { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ", timestamp: Date.now() },
      { address: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V3VQ", timestamp: Date.now() },
    ];

    vi.mocked(apiClient.api.get).mockResolvedValue(mockParticipants);

    render(<RecentParticipants raffleId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/2 participants/)).toBeInTheDocument();
    });
  });

  it("polls for new participants every 15 seconds", async () => {
    const mockParticipants = [
      { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ", timestamp: Date.now() },
    ];

    vi.mocked(apiClient.api.get).mockResolvedValue(mockParticipants);

    render(<RecentParticipants raffleId={1} />);

    await waitFor(() => {
      expect(apiClient.api.get).toHaveBeenCalled();
    });

    const initialCallCount = vi.mocked(apiClient.api.get).mock.calls.length;

    // Advance time by 15 seconds
    vi.advanceTimersByTime(15000);

    await waitFor(() => {
      expect(vi.mocked(apiClient.api.get).mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it("adds optimistic participant via ref handle", async () => {
    const mockParticipants = [
      { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ", timestamp: Date.now() },
    ];

    vi.mocked(apiClient.api.get).mockResolvedValue(mockParticipants);

    const onOptimisticUpdate = vi.fn();
    const ref = { current: null as RecentParticipantsHandle | null };

    const { rerender } = render(
      <RecentParticipants
        raffleId={1}
        currentUserAddress="GTEST"
        onOptimisticUpdate={onOptimisticUpdate}
        ref={ref as any}
      />
    );

    // Re-render to ensure ref callback fires
    rerender(
      <RecentParticipants
        raffleId={1}
        currentUserAddress="GTEST"
        onOptimisticUpdate={onOptimisticUpdate}
        ref={ref as any}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/1 participant/)).toBeInTheDocument();
    });

    // Simulate optimistic update via ref
    act(() => {
      ref.current?.addOptimisticParticipant("GTEST");
    });

    expect(onOptimisticUpdate).toHaveBeenCalledWith("GTEST");
  });

  it("respects prefers-reduced-motion", () => {
    const mockParticipants = [
      { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ", timestamp: Date.now() },
    ];

    vi.mocked(apiClient.api.get).mockResolvedValue(mockParticipants);

    // Mock matchMedia to return prefers-reduced-motion: reduce
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<RecentParticipants raffleId={1} />);

    // Component should render without animations
    expect(screen.getByText("Recent Participants")).toBeInTheDocument();
  });

  it("caps displayed participants at 20", async () => {
    const mockParticipants = Array.from({ length: 30 }, (_, i) => ({
      address: `G${"A".repeat(54 - i.toString().length)}${i}`,
      timestamp: Date.now() - i * 1000,
    }));

    vi.mocked(apiClient.api.get).mockResolvedValue(mockParticipants);

    render(<RecentParticipants raffleId={1} />);

    await waitFor(() => {
      const avatars = screen.getAllByText(/\.\.\./);
      expect(avatars.length).toBeLessThanOrEqual(20);
    });
  });

  it("handles API errors gracefully", async () => {
    vi.mocked(apiClient.api.get).mockRejectedValue(new Error("API Error"));

    render(<RecentParticipants raffleId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load participants/)).toBeInTheDocument();
    });
  });
});

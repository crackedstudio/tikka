import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useRaffles, useRaffle, useUserProfile, useUserHistory } from "./useRaffles";
import * as raffleService from "../services/raffleService";
import type {
    ApiUserProfile,
    ApiUserHistoryResponse,
    ApiRaffleListItem,
    ApiRaffleListResponse,
    ApiRaffleDetail,
    FormattedRaffle,
} from "../types/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockRaffleListItem: ApiRaffleListItem = {
    id: 1,
    creator: "GCREATOR123",
    status: "open",
    ticket_price: "10.000",
    asset: "XLM",
    max_tickets: 100,
    tickets_sold: 25,
    end_time: "2026-12-31T23:59:59Z",
    winner: null,
    prize_amount: "500.00",
    created_ledger: 1000,
    finalized_ledger: null,
    metadata_cid: "QmTest123",
    created_at: "2026-01-01T00:00:00Z",
    participant_count: 10,
};

const mockRaffleListResponse: ApiRaffleListResponse = {
    raffles: [mockRaffleListItem],
    total: 1,
};

const mockRaffleDetail: ApiRaffleDetail = {
    ...mockRaffleListItem,
    title: "Test Raffle",
    description: "A test raffle description",
    image_url: "https://example.com/image.jpg",
    category: "Electronics",
};

const mockFormattedRaffle: FormattedRaffle = {
    id: 1,
    creator: "GCREATOR123",
    status: "open",
    description: "Test Raffle",
    endTime: Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000),
    maxTickets: 100,
    allowMultipleTickets: true,
    ticketPrice: "10.000",
    ticketToken: "XLM",
    totalTicketsSold: 25,
    winner: null,
    winningTicketId: 0,
    isActive: true,
    isFinalized: false,
    winningsWithdrawn: false,
    countdown: {
        days: "00",
        hours: "00",
        minutes: "00",
        seconds: "00",
    },
    progress: 25,
    entries: 25,
    ticketPriceFormatted: "10.000 XLM",
    prizeValue: "500.00",
    prizeCurrency: "XLM",
    buttonText: "Enter Raffle",
    image: "https://example.com/image.jpg",
    metadata: {
        title: "Test Raffle",
        description: "A test raffle description",
        image: "https://example.com/image.jpg",
        prizeName: "Test Raffle",
        prizeValue: "500.00",
        prizeCurrency: "XLM",
        category: "Electronics",
        tags: ["Electronics"],
        createdBy: "GCREATOR123",
        createdAt: new Date("2026-01-01T00:00:00Z").getTime(),
        updatedAt: new Date("2026-01-01T00:00:00Z").getTime(),
    },
};

const mockProfile: ApiUserProfile = {
    address: "GABC123",
    total_tickets_bought: 10,
    total_raffles_entered: 5,
    total_raffles_won: 1,
    total_prize_xlm: "100.00",
    first_seen_ledger: 1000,
    updated_at: "2026-01-01T00:00:00Z",
};

const mockHistoryResponse: ApiUserHistoryResponse = {
    items: [
        {
            raffle_id: 1,
            status: "finalized",
            tickets_bought: 2,
            purchased_at_ledger: 1001,
            purchase_tx_hash: "abc123",
            prize_amount: "100.00",
            is_winner: true,
        },
        {
            raffle_id: 2,
            status: "open",
            tickets_bought: 1,
            purchased_at_ledger: 1002,
            purchase_tx_hash: "def456",
            prize_amount: null,
            is_winner: false,
        },
    ],
    total: 2,
};

// ── useRaffles ────────────────────────────────────────────────────────────────

describe("useRaffles", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches and returns raffles on mount", async () => {
        vi.spyOn(raffleService, "fetchRaffles").mockResolvedValue(mockRaffleListResponse);

        const { result } = renderHook(() => useRaffles());

        expect(result.current.isLoading).toBe(true);
        expect(result.current.raffles).toEqual([]);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);
        expect(result.current.total).toBe(1);
        expect(result.current.error).toBeNull();
        expect(raffleService.fetchRaffles).toHaveBeenCalledWith(undefined);
    });

    it("applies filters when provided", async () => {
        vi.spyOn(raffleService, "fetchRaffles").mockResolvedValue(mockRaffleListResponse);

        const filters = { status: "open", category: "Electronics" };
        const { result } = renderHook(() => useRaffles(filters));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(raffleService.fetchRaffles).toHaveBeenCalledWith(filters);
        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);
    });

    it("sets error when fetch fails", async () => {
        const errorMessage = "Network error";
        vi.spyOn(raffleService, "fetchRaffles").mockRejectedValue(new Error(errorMessage));

        const { result } = renderHook(() => useRaffles());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffles).toEqual([]);
        expect(result.current.error?.message).toBe(errorMessage);
    });

    it("handles non-Error rejections", async () => {
        vi.spyOn(raffleService, "fetchRaffles").mockRejectedValue("String error");

        const { result } = renderHook(() => useRaffles());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.error?.message).toBe("Failed to fetch raffles");
    });

    it("refetch triggers a new fetch", async () => {
        const spy = vi.spyOn(raffleService, "fetchRaffles").mockResolvedValue(mockRaffleListResponse);

        const { result } = renderHook(() => useRaffles());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(spy).toHaveBeenCalledTimes(1);

        result.current.refetch();

        await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    });

    it("cancels stale requests when filters change", async () => {
        const firstResponse: ApiRaffleListResponse = {
            raffles: [{ ...mockRaffleListItem, id: 1 }],
            total: 1,
        };
        const secondResponse: ApiRaffleListResponse = {
            raffles: [{ ...mockRaffleListItem, id: 2 }],
            total: 1,
        };

        let resolveFirst: (value: ApiRaffleListResponse) => void;
        let resolveSecond: (value: ApiRaffleListResponse) => void;

        const firstPromise = new Promise<ApiRaffleListResponse>((resolve) => {
            resolveFirst = resolve;
        });
        const secondPromise = new Promise<ApiRaffleListResponse>((resolve) => {
            resolveSecond = resolve;
        });

        const spy = vi
            .spyOn(raffleService, "fetchRaffles")
            .mockReturnValueOnce(firstPromise)
            .mockReturnValueOnce(secondPromise);

        const { result, rerender } = renderHook(
            ({ filters }) => useRaffles(filters),
            { initialProps: { filters: { status: "open" } } }
        );

        expect(spy).toHaveBeenCalledTimes(1);

        // Change filters before first request completes
        rerender({ filters: { status: "closed" } });

        expect(spy).toHaveBeenCalledTimes(2);

        // Resolve second request first
        resolveSecond!(secondResponse);
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffles).toEqual(secondResponse.raffles);

        // Resolve first request (should be ignored)
        resolveFirst!(firstResponse);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should still have second response
        expect(result.current.raffles).toEqual(secondResponse.raffles);
    });

    it("uses total from response or defaults to raffles length", async () => {
        const responseWithoutTotal: ApiRaffleListResponse = {
            raffles: [mockRaffleListItem, { ...mockRaffleListItem, id: 2 }],
        };

        vi.spyOn(raffleService, "fetchRaffles").mockResolvedValue(responseWithoutTotal);

        const { result } = renderHook(() => useRaffles());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.total).toBe(2);
    });
});

// ── useRaffle ─────────────────────────────────────────────────────────────────

describe("useRaffle", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches and returns raffle detail", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockResolvedValue(mockRaffleDetail);
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(mockFormattedRaffle);

        const { result } = renderHook(() => useRaffle(1));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffle).toEqual(mockFormattedRaffle);
        expect(result.current.error).toBeNull();
        expect(raffleService.fetchRaffleDetail).toHaveBeenCalledWith(1);
    });

    it("returns null and no loading when raffleId is 0", () => {
        const { result } = renderHook(() => useRaffle(0));

        expect(result.current.raffle).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("sets error when fetch fails", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockRejectedValue(
            new Error("Not found")
        );

        const { result } = renderHook(() => useRaffle(1));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffle).toBeNull();
        expect(result.current.error?.message).toBe("Not found");
    });

    it("handles non-Error rejections", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockRejectedValue("String error");

        const { result } = renderHook(() => useRaffle(1));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.error?.message).toBe("Failed to fetch raffle 1");
    });

    it("refetch triggers a new fetch", async () => {
        const spy = vi.spyOn(raffleService, "fetchRaffleDetail").mockResolvedValue(mockRaffleDetail);
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(mockFormattedRaffle);

        const { result } = renderHook(() => useRaffle(1));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(spy).toHaveBeenCalledTimes(1);

        result.current.refetch();

        await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    });

    it("resets state when raffleId changes to 0", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockResolvedValue(mockRaffleDetail);
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(mockFormattedRaffle);

        const { result, rerender } = renderHook(
            ({ id }) => useRaffle(id),
            { initialProps: { id: 1 } }
        );

        await waitFor(() => expect(result.current.raffle).toEqual(mockFormattedRaffle));

        rerender({ id: 0 });

        expect(result.current.raffle).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("cancels stale requests when raffleId changes", async () => {
        const firstDetail: ApiRaffleDetail = { ...mockRaffleDetail, id: 1 };
        const secondDetail: ApiRaffleDetail = { ...mockRaffleDetail, id: 2 };
        const firstFormatted: FormattedRaffle = { ...mockFormattedRaffle, id: 1 };
        const secondFormatted: FormattedRaffle = { ...mockFormattedRaffle, id: 2 };

        let resolveFirst: (value: ApiRaffleDetail) => void;
        let resolveSecond: (value: ApiRaffleDetail) => void;

        const firstPromise = new Promise<ApiRaffleDetail>((resolve) => {
            resolveFirst = resolve;
        });
        const secondPromise = new Promise<ApiRaffleDetail>((resolve) => {
            resolveSecond = resolve;
        });

        const spy = vi
            .spyOn(raffleService, "fetchRaffleDetail")
            .mockReturnValueOnce(firstPromise)
            .mockReturnValueOnce(secondPromise);

        vi.spyOn(raffleService, "mapDetailToFormattedRaffle")
            .mockReturnValueOnce(firstFormatted)
            .mockReturnValueOnce(secondFormatted);

        const { result, rerender } = renderHook(
            ({ id }) => useRaffle(id),
            { initialProps: { id: 1 } }
        );

        expect(spy).toHaveBeenCalledTimes(1);

        // Change raffleId before first request completes
        rerender({ id: 2 });

        expect(spy).toHaveBeenCalledTimes(2);

        // Resolve second request first
        resolveSecond!(secondDetail);
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffle?.id).toBe(2);

        // Resolve first request (should be ignored)
        resolveFirst!(firstDetail);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should still have second raffle
        expect(result.current.raffle?.id).toBe(2);
    });
});

// ── useUserProfile ────────────────────────────────────────────────────────────

describe("useUserProfile", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null profile and no loading when address is null", () => {
        const { result } = renderHook(() => useUserProfile(null));
        expect(result.current.profile).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("fetches and returns profile for a given address", async () => {
        vi.spyOn(raffleService, "fetchUserProfile").mockResolvedValue(mockProfile);

        const { result } = renderHook(() => useUserProfile("GABC123"));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.profile).toEqual(mockProfile);
        expect(result.current.error).toBeNull();
        expect(raffleService.fetchUserProfile).toHaveBeenCalledWith("GABC123");
    });

    it("sets error when fetch fails", async () => {
        vi.spyOn(raffleService, "fetchUserProfile").mockRejectedValue(
            new Error("Network error"),
        );

        const { result } = renderHook(() => useUserProfile("GABC123"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.profile).toBeNull();
        expect(result.current.error?.message).toBe("Network error");
    });

    it("resets state when address changes to null", async () => {
        vi.spyOn(raffleService, "fetchUserProfile").mockResolvedValue(mockProfile);

        const { result, rerender } = renderHook(
            ({ addr }: { addr: string | null }) => useUserProfile(addr),
            { initialProps: { addr: "GABC123" as string | null } },
        );

        await waitFor(() => expect(result.current.profile).toEqual(mockProfile));

        rerender({ addr: null });

        expect(result.current.profile).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });
});

// ── useUserHistory ────────────────────────────────────────────────────────────

describe("useUserHistory", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns empty state when address is null", () => {
        const { result } = renderHook(() => useUserHistory(null));
        expect(result.current.items).toEqual([]);
        expect(result.current.total).toBe(0);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("fetches and returns history items", async () => {
        vi.spyOn(raffleService, "fetchUserHistory").mockResolvedValue(mockHistoryResponse);

        const { result } = renderHook(() => useUserHistory("GABC123"));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.items).toEqual(mockHistoryResponse.items);
        expect(result.current.total).toBe(2);
        expect(result.current.error).toBeNull();
    });

    it("sets error when fetch fails", async () => {
        vi.spyOn(raffleService, "fetchUserHistory").mockRejectedValue(
            new Error("Server error"),
        );

        const { result } = renderHook(() => useUserHistory("GABC123"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.items).toEqual([]);
        expect(result.current.error?.message).toBe("Server error");
    });

    it("computes pagination state correctly", async () => {
        const bigResponse: ApiUserHistoryResponse = {
            items: Array.from({ length: 10 }, (_, i) => ({
                raffle_id: i + 1,
                status: "open",
                tickets_bought: 1,
                purchased_at_ledger: 1000 + i,
                purchase_tx_hash: `hash${i}`,
                prize_amount: null,
                is_winner: false,
            })),
            total: 25,
        };
        vi.spyOn(raffleService, "fetchUserHistory").mockResolvedValue(bigResponse);

        const { result } = renderHook(() => useUserHistory("GABC123"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.page).toBe(0);
        expect(result.current.totalPages).toBe(3); // ceil(25/10)
        expect(result.current.hasPrev).toBe(false);
        expect(result.current.hasNext).toBe(true);
    });

    it("goToPage advances the page and re-fetches", async () => {
        const spy = vi.spyOn(raffleService, "fetchUserHistory").mockResolvedValue({
            items: [],
            total: 25,
        });

        const { result } = renderHook(() => useUserHistory("GABC123"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        result.current.goToPage(1);

        await waitFor(() => expect(result.current.page).toBe(1));

        // Should have been called twice: initial + after page change
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenLastCalledWith("GABC123", 10, 10);
    });
});

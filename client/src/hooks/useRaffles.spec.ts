import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useUserProfile, useUserHistory } from "./useRaffles";
import * as raffleService from "../services/raffleService";
import type { ApiUserProfile, ApiUserHistoryResponse } from "../types/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

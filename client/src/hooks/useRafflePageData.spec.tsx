import React, { type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useRafflePageData } from "./useRafflePageData";
import * as raffleService from "../services/raffleService";
import * as contractService from "../services/contractService";
import { queryKeys } from "../utils/queryKeys";
import type {
    ApiRaffleDetail,
    FormattedRaffle,
} from "../types/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockRaffleDetail: ApiRaffleDetail = {
    id: 1337,
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
    title: "Test Raffle",
    description: "A test raffle description",
    image_url: "https://example.com/image.jpg",
    category: "Electronics",
};

const mockFormattedRaffle: FormattedRaffle = {
    id: 1337,
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
    countdown: { days: "00", hours: "00", minutes: "00", seconds: "00" },
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

// ── Test wrapper ──────────────────────────────────────────────────────────────

/**
 * The hook relies on React Query, so it is exercised inside a fresh
 * `QueryClient` per test (a "React Query wrapper") rather than through a page.
 */
const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children?: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { wrapper, queryClient };
};

describe("useRafflePageData", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("reports loading while the raffle detail is pending", () => {
        vi.spyOn(raffleService, "fetchRaffleDetail")
            .mockReturnValue(new Promise(() => {}));

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useRafflePageData(1337), { wrapper });

        expect(result.current.data.status).toBe("loading");
    });

    it("becomes ready with the formatted raffle once fetched", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockResolvedValue(mockRaffleDetail);
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(mockFormattedRaffle);

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useRafflePageData(1337), { wrapper });

        await waitFor(() => expect(result.current.data.status).toBe("ready"));

        expect(result.current.data).toMatchObject({ status: "ready" });
        if (result.current.data.status === "ready") {
            expect(result.current.data.raffle).toEqual(mockFormattedRaffle);
        }
        expect(raffleService.fetchRaffleDetail).toHaveBeenCalledWith(1337);
    });

    it("surfaces the error and drops into the error union member when the fetch fails", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockRejectedValue(
            new Error("Not found"),
        );

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useRafflePageData(1337), { wrapper });

        await waitFor(() => expect(result.current.data.status).toBe("error"));

        if (result.current.data.status === "error") {
            expect(result.current.data.error.message).toBe("Not found");
        }
    });

    it("falls back to a not-found error when no raffle payload is returned", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockResolvedValue(mockRaffleDetail);
        // Simulate a response that maps to nothing usable
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(
            null as unknown as FormattedRaffle,
        );

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useRafflePageData(1337), { wrapper });

        await waitFor(() => expect(result.current.data.status).toBe("error"));

        if (result.current.data.status === "error") {
            expect(result.current.data.error.message).toBe("Raffle not found");
        }
    });

    it("exposes a purchase mutation that calls the contract service", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockResolvedValue(mockRaffleDetail);
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(mockFormattedRaffle);
        const buySpy = vi.spyOn(contractService.ContractService, "buyTickets")
            .mockResolvedValue({ ok: true } as never);

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useRafflePageData(1337), { wrapper });

        await waitFor(() => expect(result.current.data.status).toBe("ready"));

        act(() => {
            result.current.purchaseTickets.mutate({
                raffleId: 1337,
                ticketCount: 2,
                maxPricePerTicket: "10.000",
            });
        });

        await waitFor(() => expect(buySpy).toHaveBeenCalled());

        expect(buySpy).toHaveBeenCalledWith({
            raffleId: 1337,
            ticketCount: 2,
            maxPricePerTicket: "10.000",
        });
    });

    it("invalidates the raffle detail query after a successful purchase", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockResolvedValue(mockRaffleDetail);
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(mockFormattedRaffle);
        vi.spyOn(contractService.ContractService, "buyTickets")
            .mockResolvedValue({ ok: true } as never);

        const { wrapper, queryClient } = createWrapper();
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

        const { result } = renderHook(() => useRafflePageData(1337), { wrapper });

        await waitFor(() => expect(result.current.data.status).toBe("ready"));

        act(() => {
            result.current.purchaseTickets.mutate({
                raffleId: 1337,
                ticketCount: 1,
                maxPricePerTicket: "10.000",
            });
        });

        await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());

        expect(invalidateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                queryKey: queryKeys.raffles.detail(1337),
            }),
        );
    });
});
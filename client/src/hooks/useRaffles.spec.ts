import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { ReactNode } from "react";
import type {
    ApiUserProfile,
    ApiUserHistoryResponse,
    ApiRaffleListItem,
    ApiRaffleListResponse,
    ApiRaffleDetail,
    FormattedRaffle,
} from "../types/types";
import { useRaffles, useRaffle, useUserProfile, useUserHistory } from "./useRaffles";
import * as raffleService from "../services/raffleService";
import { server } from "../test/server";
import { API_BASE_URL } from "../test/handlers";

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function renderRaffleHook(hook: () => any, options?: any) {
  return renderHook(hook, { wrapper: createQueryWrapper(), ...options });
}

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

// Captured requests, reset between tests.
let raffleListUrl: string | undefined;
let detailCallCount = 0;
let listCallCount = 0;
let historyUrl: string | undefined;

beforeEach(() => {
    raffleListUrl = undefined;
    detailCallCount = 0;
    listCallCount = 0;
    historyUrl = undefined;
    vi.restoreAllMocks();
    server.resetHandlers();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── useRaffles ─────────────────────────────────────────────────────────────────

describe("useRaffles", () => {
    it("fetches and returns raffles on mount (initial load)", async () => {
        server.use(
            http.get(`${API_BASE_URL}/raffles`, ({ request }) => {
                raffleListUrl = request.url;
                listCallCount += 1;
                return HttpResponse.json(mockRaffleListResponse);
            })
        );

        const { result } = renderRaffleHook(() => useRaffles());

        expect(result.current.status.isLoading).toBe(true);
        expect(result.current.status.isRefreshing).toBe(false);
        expect(result.current.raffles).toEqual([]);

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);
        expect(result.current.total).toBe(1);
        expect(result.current.error).toBeNull();
        expect(result.current.status.isSuccess).toBe(true);
        expect(result.current.status.isEmpty).toBe(false);
        expect(result.current.status.isError).toBe(false);
        expect(raffleListUrl).toBeDefined();
        expect(raffleListUrl!).not.toContain("?");
    });

    it("handles empty result set", async () => {
        const emptyResponse: ApiRaffleListResponse = { raffles: [], total: 0 };
        server.use(http.get(`${API_BASE_URL}/raffles`, () => HttpResponse.json(emptyResponse)));

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.raffles).toEqual([]);
        expect(result.current.total).toBe(0);
        expect(result.current.status.isEmpty).toBe(true);
        expect(result.current.status.isSuccess).toBe(true);
        expect(result.current.status.isError).toBe(false);
    });

    it("applies filters when provided", async () => {
        const filters = { status: "open", category: "Electronics" };
        server.use(
            http.get(`${API_BASE_URL}/raffles`, ({ request }) => {
                raffleListUrl = request.url;
                return HttpResponse.json(mockRaffleListResponse);
            })
        );

        const { result } = renderRaffleHook(() => useRaffles(filters));

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(raffleListUrl).toContain("status=open");
        expect(raffleListUrl).toContain("category=Electronics");
        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);
    });

    it("sets error when fetch fails", async () => {
        server.use(
            http.get(`${API_BASE_URL}/raffles`, () =>
                HttpResponse.json({ message: "Network error" }, { status: 500 })
            )
        );

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.raffles).toEqual([]);
        expect(result.current.error?.message).toBe("Network error");
        expect(result.current.status.isError).toBe(true);
        expect(result.current.status.isSuccess).toBe(false);
    });

    it("handles non-Error rejections", async () => {
        // A non-Error rejection can only originate from the service layer, not from
        // the HTTP client (which always throws ApiError), so this edge case keeps a
        // targeted spy on the service method.
        vi.spyOn(raffleService, "fetchRaffles").mockRejectedValue("String error");

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.error).toBe("String error");
        expect(result.current.status.isError).toBe(true);
    });

    it("refetch triggers a new request and keeps cached data visible", async () => {
        server.use(
            http.get(`${API_BASE_URL}/raffles`, () => {
                listCallCount += 1;
                return HttpResponse.json(mockRaffleListResponse);
            })
        );

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(listCallCount).toBe(1);
        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);

        result.current.refetch();
        await waitFor(() => expect(listCallCount).toBe(2));

        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);
    });

    it("refresh success updates data", async () => {
        const updatedResponse: ApiRaffleListResponse = {
            raffles: [{ ...mockRaffleListItem, id: 99 }],
            total: 1,
        };
        let call = 0;
        const responses = [
            () => HttpResponse.json(mockRaffleListResponse),
            () => HttpResponse.json(updatedResponse),
        ];
        server.use(
            http.get(`${API_BASE_URL}/raffles`, () => responses[Math.min(call++, responses.length - 1)]())
        );

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);

        result.current.refetch();
        await waitFor(() => expect(result.current.raffles).toEqual(updatedResponse.raffles));

        expect(result.current.status.isSuccess).toBe(true);
    });

    it("refresh failure preserves cached data and surfaces error", async () => {
        let call = 0;
        const responses = [
            () => HttpResponse.json(mockRaffleListResponse),
            () => HttpResponse.json({ message: "Network error" }, { status: 500 }),
        ];
        server.use(
            http.get(`${API_BASE_URL}/raffles`, () => responses[Math.min(call++, responses.length - 1)]())
        );

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);

        result.current.refetch();
        await waitFor(() => expect(call).toBe(2));

        expect(result.current.error?.message).toBe("Network error");
        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);
    });

    it("retry clears error and refetches", async () => {
        let call = 0;
        const responses = [
            () => HttpResponse.json({ message: "Network error" }, { status: 500 }),
            () => HttpResponse.json(mockRaffleListResponse),
        ];
        server.use(
            http.get(`${API_BASE_URL}/raffles`, () => responses[Math.min(call++, responses.length - 1)]())
        );

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.status.isError).toBe(true);
        expect(result.current.error?.message).toBe("Network error");

        result.current.retry();
        await waitFor(() => expect(result.current.status.isSuccess).toBe(true));

        expect(result.current.error).toBeNull();
        expect(result.current.raffles).toEqual(mockRaffleListResponse.raffles);
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

        let resolveFirst: (value: ApiRaffleListResponse) => void = () => {};
        let resolveSecond: (value: ApiRaffleListResponse) => void = () => {};
        const firstPromise = new Promise<ApiRaffleListResponse>((resolve) => {
            resolveFirst = resolve;
        });
        const secondPromise = new Promise<ApiRaffleListResponse>((resolve) => {
            resolveSecond = resolve;
        });

        server.use(
            http.get(`${API_BASE_URL}/raffles`, () => {
                listCallCount += 1;
                return (listCallCount === 1 ? firstPromise : secondPromise).then((body) =>
                    HttpResponse.json(body)
                );
            })
        );

        const { result, rerender } = renderRaffleHook(
            ({ filters }) => useRaffles(filters),
            { initialProps: { filters: { status: "open" } } }
        );

        await waitFor(() => expect(listCallCount).toBe(1));

        rerender({ filters: { status: "closed" } });
        await waitFor(() => expect(listCallCount).toBe(2));

        resolveSecond!(secondResponse);
        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.raffles).toEqual(secondResponse.raffles);

        resolveFirst!(firstResponse);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(result.current.raffles).toEqual(secondResponse.raffles);
    });

    it("uses total from response or defaults to raffles length", async () => {
        const responseWithoutTotal: ApiRaffleListResponse = {
            raffles: [mockRaffleListItem, { ...mockRaffleListItem, id: 2 }],
        };
        server.use(http.get(`${API_BASE_URL}/raffles`, () => HttpResponse.json(responseWithoutTotal)));

        const { result } = renderRaffleHook(() => useRaffles());

        await waitFor(() => expect(result.current.status.isLoading).toBe(false));

        expect(result.current.total).toBe(2);
    });
});

// ── useRaffle ────────────────────────────────────────────────────────────────

describe("useRaffle", () => {
    it("fetches and returns raffle detail", async () => {
        let detailUrl: string | undefined;
        server.use(
            http.get(`${API_BASE_URL}/raffles/:id`, ({ request }) => {
                detailUrl = request.url;
                return HttpResponse.json(mockRaffleDetail);
            })
        );
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(
            mockFormattedRaffle
        );

        const { result } = renderRaffleHook(() => useRaffle(1));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffle).toEqual(mockFormattedRaffle);
        expect(result.current.error).toBeNull();
        expect(detailUrl).toContain("/raffles/1");
    });

    it("returns null and no loading when raffleId is 0", () => {
        const { result } = renderRaffleHook(() => useRaffle(0));

        expect(result.current.raffle).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("sets error when fetch fails", async () => {
        server.use(
            http.get(`${API_BASE_URL}/raffles/:id`, () =>
                HttpResponse.json({ message: "Not found" }, { status: 404 })
            )
        );
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(
            mockFormattedRaffle
        );

        const { result } = renderRaffleHook(() => useRaffle(1));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.raffle).toBeNull();
        expect(result.current.error?.message).toBe("Not found");
    });

    it("handles non-Error rejections", async () => {
        vi.spyOn(raffleService, "fetchRaffleDetail").mockRejectedValue("String error");

        const { result } = renderRaffleHook(() => useRaffle(1));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.error).toBe("String error");
    });

    it("refetch triggers a new fetch", async () => {
        server.use(
            http.get(`${API_BASE_URL}/raffles/:id`, () => {
                detailCallCount += 1;
                return HttpResponse.json(mockRaffleDetail);
            })
        );
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(
            mockFormattedRaffle
        );

        const { result } = renderRaffleHook(() => useRaffle(1));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(detailCallCount).toBe(1);

        result.current.refetch();

        await waitFor(() => expect(detailCallCount).toBe(2));
    });

    it("resets state when raffleId changes to 0", async () => {
        server.use(http.get(`${API_BASE_URL}/raffles/:id`, ({ params }) =>
            HttpResponse.json({ ...mockRaffleDetail, id: Number(params.id) })
        ));
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockReturnValue(
            mockFormattedRaffle
        );

        const { result, rerender } = renderRaffleHook(
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

        let resolveFirst: (value: ApiRaffleDetail) => void = () => {};
        let resolveSecond: (value: ApiRaffleDetail) => void = () => {};
        const firstPromise = new Promise<ApiRaffleDetail>((resolve) => {
            resolveFirst = resolve;
        });
        const secondPromise = new Promise<ApiRaffleDetail>((resolve) => {
            resolveSecond = resolve;
        });

        server.use(
            http.get(`${API_BASE_URL}/raffles/:id`, () => {
                detailCallCount += 1;
                return (detailCallCount === 1 ? firstPromise : secondPromise).then((body) =>
                    HttpResponse.json(body)
                );
            })
        );
        vi.spyOn(raffleService, "mapDetailToFormattedRaffle").mockImplementation((detail) => {
            return detail.id === 1 ? firstFormatted : secondFormatted;
        });

        const { result, rerender } = renderRaffleHook(
            ({ id }) => useRaffle(id),
            { initialProps: { id: 1 } }
        );

        await waitFor(() => expect(detailCallCount).toBe(1));

        rerender({ id: 2 });
        await waitFor(() => expect(detailCallCount).toBe(2));

        resolveSecond!(secondDetail);
        await waitFor(() => expect(result.current.raffle?.id).toBe(2));

        resolveFirst!(firstDetail);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(result.current.raffle?.id).toBe(2);
    });
});

// ── useUserProfile ────────────────────────────────────────────────────────────

describe("useUserProfile", () => {
    it("returns null profile and no loading when address is null", () => {
        const { result } = renderRaffleHook(() => useUserProfile(null));
        expect(result.current.profile).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("fetches and returns profile for a given address", async () => {
        let profileUrl: string | undefined;
        server.use(
            http.get(`${API_BASE_URL}/users/:address`, ({ request, params }) => {
                profileUrl = request.url;
                return HttpResponse.json({ ...mockProfile, address: String(params.address) });
            })
        );

        const { result } = renderRaffleHook(() => useUserProfile("GABC123"));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.profile).toEqual(mockProfile);
        expect(result.current.error).toBeNull();
        expect(profileUrl).toContain("/users/GABC123");
    });

    it("sets error when fetch fails", async () => {
        server.use(
            http.get(`${API_BASE_URL}/users/:address`, () =>
                HttpResponse.json({ message: "Network error" }, { status: 500 })
            )
        );

        const { result } = renderRaffleHook(() => useUserProfile("GABC123"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.profile).toBeNull();
        expect(result.current.error?.message).toBe("Network error");
    });

    it("resets state when address changes to null", async () => {
        server.use(http.get(`${API_BASE_URL}/users/:address`, () => HttpResponse.json(mockProfile)));

        const { result, rerender } = renderRaffleHook(
            ({ addr }: { addr: string | null }) => useUserProfile(addr),
            { initialProps: { addr: "GABC123" as string | null } }
        );

        await waitFor(() => expect(result.current.profile).toEqual(mockProfile));

        rerender({ addr: null });

        expect(result.current.profile).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });
});

// ── useUserHistory ────────────────────────────────────────────────────────────

describe("useUserHistory", () => {
    it("returns empty state when address is null", () => {
        const { result } = renderRaffleHook(() => useUserHistory(null));
        expect(result.current.items).toEqual([]);
        expect(result.current.total).toBe(0);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("fetches and returns history items", async () => {
        server.use(http.get(`${API_BASE_URL}/users/:address/history`, () => HttpResponse.json(mockHistoryResponse)));

        const { result } = renderRaffleHook(() => useUserHistory("GABC123"));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.items).toEqual(mockHistoryResponse.items);
        expect(result.current.total).toBe(2);
        expect(result.current.error).toBeNull();
    });

    it("sets error when fetch fails", async () => {
        server.use(
            http.get(`${API_BASE_URL}/users/:address/history`, () =>
                HttpResponse.json({ message: "Server error" }, { status: 500 })
            )
        );

        const { result } = renderRaffleHook(() => useUserHistory("GABC123"));

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
        server.use(http.get(`${API_BASE_URL}/users/:address/history`, () => HttpResponse.json(bigResponse)));

        const { result } = renderRaffleHook(() => useUserHistory("GABC123"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.page).toBe(0);
        expect(result.current.totalPages).toBe(3);
        expect(result.current.hasPrev).toBe(false);
        expect(result.current.hasNext).toBe(true);
    });

    it("goToPage advances the page and re-fetches", async () => {
        server.use(
            http.get(`${API_BASE_URL}/users/:address/history`, ({ request }) => {
                historyUrl = request.url;
                return HttpResponse.json({ items: [], total: 25 });
            })
        );

        const { result } = renderRaffleHook(() => useUserHistory("GABC123"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        result.current.goToPage(1);

        await waitFor(() => expect(result.current.page).toBe(1));

        expect(historyUrl).toContain("limit=10");
        expect(historyUrl).toContain("offset=10");
    });
});

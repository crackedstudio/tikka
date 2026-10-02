import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLeaderboard } from "./useLeaderboard";
import { API_BASE_URL } from "../test/handlers";
import { server } from "../test/server";
import type { LeaderboardResponse } from "../types/api-types";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useLeaderboard", () => {
  beforeEach(() => server.resetHandlers());
  afterEach(() => server.resetHandlers());

  it("returns an empty leaderboard response", async () => {
    const response: LeaderboardResponse = { entries: [] };
    server.use(
      http.get(`${API_BASE_URL}/leaderboard`, () => HttpResponse.json(response)),
    );

    const { result } = renderHook(() => useLeaderboard(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(response);
    expect(result.current.error).toBeNull();
  });

  it("returns entries from a single page", async () => {
    const response: LeaderboardResponse = {
      entries: [
        {
          address: "GPLAYER1",
          rank: 1,
          total_wins: 9,
          total_tickets: 20,
          total_volume_xlm: "9007199254740993",
        },
      ],
      nextCursor: null,
    };
    server.use(
      http.get(`${API_BASE_URL}/leaderboard`, () => HttpResponse.json(response)),
    );

    const { result } = renderHook(
      () => useLeaderboard({ by: "wins", limit: 20 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(response);
  });

  it("fetches cursor pages as distinct queries", async () => {
    const requests: string[] = [];
    server.use(
      http.get(`${API_BASE_URL}/leaderboard`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? "first";
        requests.push(cursor);
        const response: LeaderboardResponse = cursor === "first"
          ? { entries: [{ address: "GFIRST", rank: 1, total_wins: 5 }], nextCursor: "page-2" }
          : { entries: [{ address: "GSECOND", rank: 2, total_wins: 4 }], nextCursor: null };
        return HttpResponse.json(response);
      }),
    );

    const { result, rerender } = renderHook(
      ({ cursor }: { cursor?: string }) => useLeaderboard({ by: "wins", limit: 1, cursor }),
      { initialProps: {}, wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data?.entries[0]?.address).toBe("GFIRST"));

    rerender({ cursor: result.current.data?.nextCursor ?? undefined });
    await waitFor(() => expect(result.current.data?.entries[0]?.address).toBe("GSECOND"));

    expect(requests).toEqual(["first", "page-2"]);
    expect(result.current.data?.nextCursor).toBeNull();
  });

  it("handles fetch error correctly", async () => {
    server.use(
      http.get(`${API_BASE_URL}/leaderboard`, () =>
        HttpResponse.json({ message: "Internal server error" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useLeaderboard(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });
});
/**
 * useUserSubscriptions Tests
 *
 * Exercises the settings-page hook against real MSW handlers (through
 * notificationService and apiClient). Covers:
 *  - loading the subscriptions on mount, with loading/error states
 *  - unsubscribing by subscription id (and raffle id) with local removal
 *  - failure keeping the list intact
 *  - refetch and the unauthenticated guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useUserSubscriptions } from "./useUserSubscriptions";
import { server } from "../test/server";
import { API_BASE_URL } from "../test/handlers";
import type { UserSubscription } from "../services/notificationService";

const authState = vi.hoisted(() => ({ isAuthenticated: true }));

vi.mock("../providers/AuthProvider", () => ({
  useAuthContext: () => ({ isAuthenticated: authState.isAuthenticated }),
}));

const LIST_URL = `${API_BASE_URL}/notifications/subscriptions`;
const UNSUBSCRIBE_URL = `${API_BASE_URL}/notifications/subscribe/:raffleId`;

const subscription = (id: string, raffleId: number): UserSubscription => ({
  id,
  raffleId,
  userAddress: "GTESTADDRESS1234567890ABCDEF",
  channel: "email",
  createdAt: "2026-01-01T00:00:00Z",
});

describe("useUserSubscriptions", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    sessionStorage.setItem("tikka_auth_token", "test-jwt-token");
    server.use(http.get(LIST_URL, () => HttpResponse.json([])));
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("loads the user's subscriptions on mount", async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json([subscription("sub-1", 1), subscription("sub-2", 2)]),
      ),
    );

    const { result } = renderHook(() => useUserSubscriptions());

    await waitFor(() => expect(result.current.subscriptions).toHaveLength(2));
    expect(result.current.subscriptions.map((s) => s.id)).toEqual([
      "sub-1",
      "sub-2",
    ]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes the loading state while the request is in flight", async () => {
    let resolveList!: (response: Response) => void;
    server.use(
      http.get(
        LIST_URL,
        () =>
          new Promise<Response>((resolve) => {
            resolveList = resolve;
          }),
      ),
    );

    const { result } = renderHook(() => useUserSubscriptions());
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => {
      resolveList(HttpResponse.json([subscription("sub-1", 1)]));
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.subscriptions).toHaveLength(1);
  });

  it("reports a load failure", async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ message: "Could not load subscriptions" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useUserSubscriptions());

    await waitFor(() =>
      expect(result.current.error).toBe("Could not load subscriptions"),
    );
    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("removes the subscription locally after a successful delete", async () => {
    let deletedRaffleId: string | undefined;
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json([subscription("sub-1", 1), subscription("sub-2", 2)]),
      ),
      http.delete(UNSUBSCRIBE_URL, ({ params }) => {
        deletedRaffleId = String(params.raffleId);
        return HttpResponse.json({ success: true });
      }),
    );

    const { result } = renderHook(() => useUserSubscriptions());
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(2));

    await act(async () => {
      await result.current.unsubscribe("sub-1", 1);
    });

    expect(deletedRaffleId).toBe("1");
    expect(result.current.subscriptions.map((s) => s.id)).toEqual(["sub-2"]);
    expect(result.current.error).toBeNull();
  });

  it("keeps the subscription and reports a delete failure", async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json([subscription("sub-1", 1), subscription("sub-2", 2)]),
      ),
      http.delete(UNSUBSCRIBE_URL, () =>
        HttpResponse.json({ message: "Delete failed" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useUserSubscriptions());
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(2));

    await act(async () => {
      await result.current.unsubscribe("sub-1", 1);
    });

    expect(result.current.error).toBe("Delete failed");
    expect(result.current.subscriptions.map((s) => s.id)).toEqual([
      "sub-1",
      "sub-2",
    ]);
  });

  it("reloads the list on refetch", async () => {
    let body: UserSubscription[] = [subscription("sub-1", 1)];
    server.use(http.get(LIST_URL, () => HttpResponse.json(body)));

    const { result } = renderHook(() => useUserSubscriptions());
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));

    body = [subscription("sub-1", 1), subscription("sub-2", 2)];
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.subscriptions).toHaveLength(2));
  });

  it("does not fetch for an unauthenticated user", async () => {
    authState.isAuthenticated = false;
    const getSpy = vi.fn();
    server.use(
      http.get(LIST_URL, () => {
        getSpy();
        return HttpResponse.json([subscription("sub-1", 1)]);
      }),
    );

    const { result } = renderHook(() => useUserSubscriptions());

    await waitFor(() => expect(result.current.subscriptions).toEqual([]));
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("clears the error on request", async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ message: "Could not load subscriptions" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useUserSubscriptions());
    await waitFor(() =>
      expect(result.current.error).toBe("Could not load subscriptions"),
    );

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });
});

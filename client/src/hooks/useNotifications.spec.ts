/**
 * useNotifications Tests
 *
 * Exercises the notification-subscription hook against real MSW handlers, so
 * the request goes through apiClient and notificationService exactly as it does
 * in the app. Covers:
 *  - the subscription check on mount (subscribed / not subscribed / failure)
 *  - subscribe / unsubscribe success and failure
 *  - the unauthenticated guard (no request, sign-in error)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useNotifications } from "./useNotifications";
import { server } from "../test/server";
import { API_BASE_URL } from "../test/handlers";
import type {
  NotificationChannel,
  UserSubscription,
} from "../services/notificationService";

const authState = vi.hoisted(() => ({ isAuthenticated: true }));

vi.mock("../providers/AuthProvider", () => ({
  useAuthContext: () => ({ isAuthenticated: authState.isAuthenticated }),
}));

const LIST_URL = `${API_BASE_URL}/notifications/subscriptions`;
const SUBSCRIBE_URL = `${API_BASE_URL}/notifications/subscribe`;
const UNSUBSCRIBE_URL = `${API_BASE_URL}/notifications/subscribe/:raffleId`;

const subscription = (
  id: string,
  raffleId: number,
  channel: NotificationChannel = "email",
): UserSubscription => ({
  id,
  raffleId,
  userAddress: "GTESTADDRESS1234567890ABCDEF",
  channel,
  createdAt: "2026-01-01T00:00:00Z",
});

describe("useNotifications", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    sessionStorage.setItem("tikka_auth_token", "test-jwt-token");
    server.use(http.get(LIST_URL, () => HttpResponse.json([])));
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe("subscription check on mount", () => {
    it("marks the raffle as subscribed when it is in the user's subscriptions", async () => {
      server.use(
        http.get(LIST_URL, () =>
          HttpResponse.json([subscription("sub-1", 7)]),
        ),
      );

      const { result } = renderHook(() => useNotifications(7));

      await waitFor(() => expect(result.current.isSubscribed).toBe(true));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("leaves isSubscribed false when the raffle is not in the list", async () => {
      let listCalls = 0;
      server.use(
        http.get(LIST_URL, () => {
          listCalls += 1;
          return HttpResponse.json([subscription("sub-other", 99)]);
        }),
      );

      const { result } = renderHook(() => useNotifications(7));

      await waitFor(() => expect(listCalls).toBe(1));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isSubscribed).toBe(false);
    });

    it("reports a failure from the subscription check", async () => {
      server.use(
        http.get(LIST_URL, () =>
          HttpResponse.json({ message: "Subscriptions unavailable" }, { status: 500 }),
        ),
      );

      const { result } = renderHook(() => useNotifications(7));

      await waitFor(() =>
        expect(result.current.error).toBe("Subscriptions unavailable"),
      );
      expect(result.current.isSubscribed).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it("does not call the API for an unauthenticated user", async () => {
      authState.isAuthenticated = false;
      const getSpy = vi.fn();
      server.use(
        http.get(LIST_URL, () => {
          getSpy();
          return HttpResponse.json([]);
        }),
      );

      const { result } = renderHook(() => useNotifications(7));

      await waitFor(() => expect(result.current.isSubscribed).toBe(false));
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe("subscribe", () => {
    it("posts the raffle id and channel and flips the state", async () => {
      let posted: Record<string, unknown> | undefined;
      server.use(
        http.post(SUBSCRIBE_URL, async ({ request }) => {
          posted = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(subscription("sub-9", 7, "push"), {
            status: 201,
          });
        }),
      );

      const { result } = renderHook(() => useNotifications(7));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.subscribe(7, "push");
      });

      expect(posted).toEqual({ raffleId: 7, channel: "push" });
      expect(result.current.isSubscribed).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("defaults the channel to email", async () => {
      let posted: Record<string, unknown> | undefined;
      server.use(
        http.post(SUBSCRIBE_URL, async ({ request }) => {
          posted = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(subscription("sub-9", 7), { status: 201 });
        }),
      );

      const { result } = renderHook(() => useNotifications(7));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.subscribe(7);
      });

      expect(posted).toEqual({ raffleId: 7, channel: "email" });
    });

    it("surfaces a failure, rethrows and leaves the state unsubscribed", async () => {
      server.use(
        http.post(SUBSCRIBE_URL, () =>
          HttpResponse.json({ message: "Too many requests" }, { status: 429 }),
        ),
      );

      const { result } = renderHook(() => useNotifications(7));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await expect(result.current.subscribe(7)).rejects.toThrow(
          "Too many requests",
        );
      });

      expect(result.current.error).toBe("Too many requests");
      expect(result.current.isSubscribed).toBe(false);
    });

    it("asks an unauthenticated user to sign in without calling the API", async () => {
      authState.isAuthenticated = false;
      const postSpy = vi.fn();
      server.use(
        http.post(SUBSCRIBE_URL, () => {
          postSpy();
          return HttpResponse.json(subscription("sub-x", 7), { status: 201 });
        }),
      );

      const { result } = renderHook(() => useNotifications(7));

      await act(async () => {
        await result.current.subscribe(7);
      });

      expect(result.current.error).toBe(
        "Please sign in to subscribe to notifications",
      );
      expect(postSpy).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribe", () => {
    it("deletes the subscription and clears the subscribed state", async () => {
      let deletedRaffleId: string | undefined;
      server.use(
        http.get(LIST_URL, () =>
          HttpResponse.json([subscription("sub-1", 7)]),
        ),
        http.delete(UNSUBSCRIBE_URL, ({ params }) => {
          deletedRaffleId = String(params.raffleId);
          return HttpResponse.json({ success: true });
        }),
      );

      const { result } = renderHook(() => useNotifications(7));
      await waitFor(() => expect(result.current.isSubscribed).toBe(true));

      await act(async () => {
        await result.current.unsubscribe(7);
      });

      expect(deletedRaffleId).toBe("7");
      expect(result.current.isSubscribed).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("keeps the subscribed state and reports a delete failure", async () => {
      server.use(
        http.get(LIST_URL, () =>
          HttpResponse.json([subscription("sub-1", 7)]),
        ),
        http.delete(UNSUBSCRIBE_URL, () =>
          HttpResponse.json({ message: "Delete failed" }, { status: 500 }),
        ),
      );

      const { result } = renderHook(() => useNotifications(7));
      await waitFor(() => expect(result.current.isSubscribed).toBe(true));

      await act(async () => {
        await expect(result.current.unsubscribe(7)).rejects.toThrow(
          "Delete failed",
        );
      });

      expect(result.current.error).toBe("Delete failed");
      expect(result.current.isSubscribed).toBe(true);
    });
  });

  it("clears the error on request", async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ message: "Subscriptions unavailable" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useNotifications(7));
    await waitFor(() =>
      expect(result.current.error).toBe("Subscriptions unavailable"),
    );

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });
});

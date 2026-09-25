/**
 * useEventSource Tests
 *
 * useEventSource is the client half of the backend SseService: it opens the SSE
 * stream that carries live ticket-count updates. Long-lived connections are
 * where leaks hide, so this spec focuses on:
 *  - cleanup: the EventSource is closed and every listener removed on unmount
 *  - reconnection: an error keeps the connection open for the browser's native
 *    reconnect, and a later update is still delivered (no handlers dropped)
 *  - no duplicated handlers: re-rendering must not open a second connection or
 *    register the same listener twice (the classic cause of doubled updates)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useEventSource } from "./useEventSource";
import { queryKeys } from "../utils/queryKeys";
import { logger } from "../utils/logger";

type Listener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  emit(type: string, init: Partial<MessageEvent> = {}): void {
    const event = { type, ...init } as unknown as MessageEvent;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

const ticketEvent = (ticketsSold: number) =>
  ({ data: JSON.stringify({ ticketsSold }) }) as Partial<MessageEvent>;

describe("useEventSource", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens the stream and subscribes to ticket counts and errors", () => {
    renderHook(() =>
      useEventSource("/raffles/1/events", { onMessage: vi.fn() }),
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const source = MockEventSource.instances[0];
    expect(source.url).toBe("/raffles/1/events");
    expect(source.listenerCount("ticket_count_updated")).toBe(1);
    expect(source.listenerCount("error")).toBe(1);
  });

  it("only forwards the named ticket_count_updated event", () => {
    const onMessage = vi.fn();
    renderHook(() =>
      useEventSource("/raffles/1/events", { onMessage }),
    );

    const source = MockEventSource.instances[0];
    source.emit("message", ticketEvent(1));
    expect(onMessage).not.toHaveBeenCalled();

    source.emit("ticket_count_updated", ticketEvent(7));
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ticket_count_updated",
        data: JSON.stringify({ ticketsSold: 7 }),
      }),
    );
  });

  it("closes the connection and removes every listener on unmount", () => {
    const { unmount } = renderHook(() =>
      useEventSource("/raffles/1/events", { onMessage: vi.fn() }),
    );

    const source = MockEventSource.instances[0];
    expect(source.closed).toBe(false);

    unmount();

    expect(source.closed).toBe(true);
    expect(source.listenerCount("ticket_count_updated")).toBe(0);
    expect(source.listenerCount("error")).toBe(0);
  });

  it("does not open a connection when disabled", () => {
    renderHook(() =>
      useEventSource("/raffles/1/events", { onMessage: vi.fn(), enabled: false }),
    );

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("closes the stream when it becomes disabled and reopens when enabled again", () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        useEventSource("/raffles/1/events", { onMessage: vi.fn(), enabled }),
      { initialProps: { enabled: true } },
    );

    const first = MockEventSource.instances[0];
    rerender({ enabled: false });
    expect(first.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1);

    rerender({ enabled: true });
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].closed).toBe(false);
  });

  it("reports errors without closing the stream so the browser can reconnect", () => {
    const onMessage = vi.fn();
    const onError = vi.fn();
    renderHook(() =>
      useEventSource("/raffles/1/events", { onMessage, onError }),
    );

    const source = MockEventSource.instances[0];

    source.emit("error");
    expect(onError).toHaveBeenCalledTimes(1);
    // Closing here would defeat the native EventSource reconnect.
    expect(source.closed).toBe(false);

    // Traffic after the drop is still delivered: no handlers were dropped.
    source.emit("ticket_count_updated", ticketEvent(8));
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate handlers across a reconnect", () => {
    const onMessage = vi.fn();
    const onError = vi.fn();
    renderHook(() =>
      useEventSource("/raffles/1/events", { onMessage, onError }),
    );

    const source = MockEventSource.instances[0];
    source.emit("error");
    source.emit("ticket_count_updated", ticketEvent(1));
    source.emit("ticket_count_updated", ticketEvent(2));

    expect(onError).toHaveBeenCalledTimes(1);
    // Exactly one call per event — a double registration would yield four.
    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(source.listenerCount("ticket_count_updated")).toBe(1);
  });

  it("does not open a new connection when only the handler changes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: (event: MessageEvent) => void }) =>
        useEventSource("/raffles/1/events", { onMessage: cb }),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });

    expect(MockEventSource.instances).toHaveLength(1);
    const source = MockEventSource.instances[0];
    expect(source.listenerCount("ticket_count_updated")).toBe(1);

    source.emit("ticket_count_updated", ticketEvent(3));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("tears down the old stream and opens exactly one new stream when the url changes", () => {
    const { rerender } = renderHook(
      ({ url }) => useEventSource(url, { onMessage: vi.fn() }),
      { initialProps: { url: "/raffles/1/events" } },
    );

    const first = MockEventSource.instances[0];
    rerender({ url: "/raffles/2/events" });

    expect(first.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    const second = MockEventSource.instances[1];
    expect(second.url).toBe("/raffles/2/events");
    expect(second.listenerCount("ticket_count_updated")).toBe(1);
    expect(second.listenerCount("error")).toBe(1);
  });

  it("falls back to a no-op (with a warning) when EventSource is unsupported", () => {
    vi.stubGlobal("EventSource", undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    expect(() =>
      renderHook(() => useEventSource("/raffles/1/events", { onMessage: vi.fn() })),
    ).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("EventSource is not supported"),
    );
    expect(MockEventSource.instances).toHaveLength(0);
  });

  /**
   * Integration assertion for the ticket-count contract. There is no production
   * component consuming useEventSource yet, so the consumer wiring (invalidate
   * the raffle detail query on a ticket-count event) lives in this test to lock
   * in the query key the SSE stream is expected to invalidate.
   */
  it("delivers ticket-count events to a consumer that invalidates the raffle detail query", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() =>
      useEventSource("/raffles/42/events", {
        onMessage: () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.raffles.detail(42),
          });
        },
      }),
    );

    const source = MockEventSource.instances[0];
    source.emit("ticket_count_updated", ticketEvent(11));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.raffles.detail(42),
    });
    expect(queryKeys.raffles.detail(42)).toEqual(["raffles", "detail", 42]);
  });
});

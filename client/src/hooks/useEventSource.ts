import { useEffect, useRef } from "react";

interface UseEventSourceOptions {
  onMessage: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  enabled?: boolean;
}

/**
 * Subscribes to an SSE stream at `url`.
 * Falls back to no-op if EventSource is not supported by the browser.
 * Automatically reconnects after errors (browser handles this natively).
 * Closes the connection when the component unmounts or `enabled` becomes false.
 */
export function useEventSource(
  url: string,
  { onMessage, onError, enabled = true }: UseEventSourceOptions,
) {
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);

  // Keep refs up to date so handlers always have latest closure values
  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!enabled) return;

    // Fall back gracefully if the browser doesn't support SSE
    if (typeof EventSource === "undefined") {
      console.warn("useEventSource: EventSource is not supported in this browser.");
      return;
    }

    const es = new EventSource(url);

    const handleMessage = (event: MessageEvent) => {
      onMessageRef.current(event);
    };

    const handleError = (event: Event) => {
      if (onErrorRef.current) {
        onErrorRef.current(event);
      }
    };

    es.addEventListener("ticket_count_updated", handleMessage);
    es.addEventListener("error", handleError);

    return () => {
      es.removeEventListener("ticket_count_updated", handleMessage);
      es.removeEventListener("error", handleError);
      es.close();
    };
  }, [url, enabled]);
}

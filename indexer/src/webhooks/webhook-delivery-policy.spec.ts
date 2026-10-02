import {
  BACKOFF_BASE_MS,
  DELIVERY_TIMEOUT_MS,
  MAX_DELIVERY_ATTEMPTS,
  backoffDelayMs,
  classifyDeliveryFailure,
  classifyFailureMessage,
  isRetryableStatus,
} from "./webhook-delivery-policy";
import { WebhookDlqReason } from "../database/entities/webhook-dead-letter.entity";

/**
 * The delivery policy is where "4xx do not retry", "5xx retry with backoff",
 * and "which dead-letter reason" are actually decided. Asserting it directly
 * keeps those decisions from being implied by a mocked fetch call.
 */
describe("webhook delivery policy", () => {
  describe("isRetryableStatus", () => {
    it("retries every 5xx", () => {
      for (const status of [500, 502, 503, 504, 599]) {
        expect(isRetryableStatus(status)).toBe(true);
      }
    });

    it("does not retry a 4xx that will not change", () => {
      // The issue's requirement: a rejected request stays rejected.
      for (const status of [400, 401, 403, 404, 409, 410, 422]) {
        expect(isRetryableStatus(status)).toBe(false);
      }
    });

    it("still retries the 4xx statuses that are transient by definition", () => {
      expect(isRetryableStatus(408)).toBe(true);
      expect(isRetryableStatus(429)).toBe(true);
    });

    it("does not describe a success or redirect as retryable", () => {
      for (const status of [200, 201, 204, 301, 302]) {
        expect(isRetryableStatus(status)).toBe(false);
      }
    });
  });

  describe("backoffDelayMs", () => {
    it("keeps the delays the service has always used", () => {
      expect(backoffDelayMs(1)).toBe(2_000);
      expect(backoffDelayMs(2)).toBe(4_000);
      expect(backoffDelayMs(3)).toBe(8_000);
    });

    it("doubles per attempt from the configured base", () => {
      expect(backoffDelayMs(1, 500)).toBe(1_000);
      expect(backoffDelayMs(2, 500)).toBe(2_000);
      expect(BACKOFF_BASE_MS).toBe(1_000);
    });
  });

  describe("classifyFailureMessage", () => {
    it.each([
      ["ECONNREFUSED 127.0.0.1:443", WebhookDlqReason.UNREACHABLE],
      ["getaddrinfo ENOTFOUND hook.example", WebhookDlqReason.UNREACHABLE],
      ["EAI_AGAIN", WebhookDlqReason.UNREACHABLE],
      ["host unreachable", WebhookDlqReason.UNREACHABLE],
      ["timeout exceeded", WebhookDlqReason.TIMEOUT],
      ["The operation was aborted due to timeout", WebhookDlqReason.TIMEOUT],
      ["This operation was aborted", WebhookDlqReason.TIMEOUT],
      ["ECONNRESET", WebhookDlqReason.NETWORK_ERROR],
      ["network error", WebhookDlqReason.NETWORK_ERROR],
      ["HTTP Error: 500 Internal Server Error", WebhookDlqReason.HTTP_ERROR],
      ["something else entirely", WebhookDlqReason.HTTP_ERROR],
    ])("maps %s to %s", (message, expected) => {
      expect(classifyFailureMessage(message)).toBe(expected);
    });

    it("reports ECONNABORTED as a network error, not a timeout", () => {
      // `ECONNABORTED` contains "abort" but is a connection failure. Matching
      // the generic "abort" token first sent operators to the wrong cause.
      expect(classifyFailureMessage("ECONNABORTED")).toBe(
        WebhookDlqReason.NETWORK_ERROR,
      );
    });
  });

  describe("classifyDeliveryFailure", () => {
    it("builds an HTTP failure with the status and a retryable verdict", () => {
      expect(
        classifyDeliveryFailure({
          status: 503,
          statusText: "Service Unavailable",
        }),
      ).toEqual({
        message: "HTTP Error: 503 Service Unavailable",
        status: 503,
        reason: WebhookDlqReason.HTTP_ERROR,
        retryable: true,
      });
    });

    it("marks a permanent 4xx as not retryable", () => {
      const failure = classifyDeliveryFailure({
        status: 400,
        statusText: "Bad Request",
      });

      expect(failure.retryable).toBe(false);
      expect(failure.message).toBe("HTTP Error: 400 Bad Request");
      expect(failure.status).toBe(400);
    });

    it("treats a 429 as retryable", () => {
      expect(
        classifyDeliveryFailure({ status: 429, statusText: "Too Many Requests" })
          .retryable,
      ).toBe(true);
    });

    it("omits the status text cleanly when the response has none", () => {
      expect(classifyDeliveryFailure({ status: 404 }).message).toBe(
        "HTTP Error: 404",
      );
    });

    it("treats a transport error as retryable", () => {
      const failure = classifyDeliveryFailure({
        error: new Error("ECONNREFUSED"),
      });

      expect(failure).toEqual({
        message: "ECONNREFUSED",
        reason: WebhookDlqReason.UNREACHABLE,
        retryable: true,
      });
      expect(failure.status).toBeUndefined();
    });

    it("classifies an AbortSignal.timeout() abort as a retryable timeout", () => {
      // This is what the service actually sees when a subscriber hangs.
      const failure = classifyDeliveryFailure({
        error: new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      });

      expect(failure.reason).toBe(WebhookDlqReason.TIMEOUT);
      expect(failure.retryable).toBe(true);
    });

    it("falls back to a usable message for a non-Error rejection", () => {
      expect(classifyDeliveryFailure({ error: "boom" }).message).toBe("boom");
      expect(classifyDeliveryFailure({ error: undefined }).message).toBe(
        "Network Error",
      );
      expect(classifyDeliveryFailure({}).message).toBe("Network Error");
    });
  });

  it("exposes a timeout below the retry budget", () => {
    // A 5s per-attempt timeout with 3 attempts stays inside a sane fan-out.
    expect(DELIVERY_TIMEOUT_MS).toBe(5_000);
    expect(MAX_DELIVERY_ATTEMPTS).toBe(3);
  });
});

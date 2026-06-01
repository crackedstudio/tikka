import {
  calculateNextInterval,
  isRateLimitError,
  isTransientError,
  DEFAULT_POLLING_CONFIG,
  PollingConfig,
} from "./polling-config";

describe("PollingConfig", () => {
  describe("calculateNextInterval", () => {
    it("should return minInterval when not lagged and no backoff", () => {
      const interval = calculateNextInterval(DEFAULT_POLLING_CONFIG, 0, 0);
      expect(interval).toBe(DEFAULT_POLLING_CONFIG.minIntervalMs);
    });

    it("should return minInterval when lag is below threshold", () => {
      const interval = calculateNextInterval(
        DEFAULT_POLLING_CONFIG,
        DEFAULT_POLLING_CONFIG.lagThresholdLedgers - 10,
        0,
      );
      expect(interval).toBe(DEFAULT_POLLING_CONFIG.minIntervalMs);
    });

    it("should increase interval when lag exceeds threshold", () => {
      const lagLedgers = DEFAULT_POLLING_CONFIG.lagThresholdLedgers * 2;
      const interval = calculateNextInterval(DEFAULT_POLLING_CONFIG, lagLedgers, 0);
      expect(interval).toBeGreaterThan(DEFAULT_POLLING_CONFIG.minIntervalMs);
      expect(interval).toBeLessThanOrEqual(DEFAULT_POLLING_CONFIG.maxIntervalMs);
    });

    it("should cap interval at maxInterval", () => {
      const lagLedgers = DEFAULT_POLLING_CONFIG.lagThresholdLedgers * 100;
      const interval = calculateNextInterval(DEFAULT_POLLING_CONFIG, lagLedgers, 0);
      expect(interval).toBeLessThanOrEqual(DEFAULT_POLLING_CONFIG.maxIntervalMs);
    });

    it("should apply exponential backoff", () => {
      const interval1 = calculateNextInterval(DEFAULT_POLLING_CONFIG, 0, 1);
      const interval2 = calculateNextInterval(DEFAULT_POLLING_CONFIG, 0, 2);
      const interval3 = calculateNextInterval(DEFAULT_POLLING_CONFIG, 0, 3);

      expect(interval1).toBeGreaterThanOrEqual(DEFAULT_POLLING_CONFIG.initialBackoffMs);
      expect(interval2).toBeGreaterThan(interval1);
      expect(interval3).toBeGreaterThan(interval2);
    });

    it("should cap backoff at maxBackoffMs", () => {
      const interval = calculateNextInterval(DEFAULT_POLLING_CONFIG, 0, 20);
      expect(interval).toBeLessThanOrEqual(DEFAULT_POLLING_CONFIG.maxBackoffMs);
    });

    it("should combine lag and backoff", () => {
      const lagLedgers = DEFAULT_POLLING_CONFIG.lagThresholdLedgers * 2;
      const intervalNoBackoff = calculateNextInterval(DEFAULT_POLLING_CONFIG, lagLedgers, 0);
      const intervalWithBackoff = calculateNextInterval(DEFAULT_POLLING_CONFIG, lagLedgers, 1);

      expect(intervalWithBackoff).toBeGreaterThanOrEqual(intervalNoBackoff);
    });

    it("should handle custom config", () => {
      const customConfig: PollingConfig = {
        minIntervalMs: 100,
        maxIntervalMs: 5000,
        maxBatchSize: 50,
        lagThresholdLedgers: 20,
        rateLimitBackoffMultiplier: 3.0,
        transientErrorBackoffMultiplier: 2.0,
        maxBackoffMs: 10000,
        initialBackoffMs: 500,
      };

      const interval = calculateNextInterval(customConfig, 0, 0);
      expect(interval).toBe(100);
    });
  });

  describe("isRateLimitError", () => {
    it("should detect 429 in error message", () => {
      expect(isRateLimitError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    });

    it("should detect rate limit keyword", () => {
      expect(isRateLimitError(new Error("Rate limit exceeded"))).toBe(true);
    });

    it("should handle string errors", () => {
      expect(isRateLimitError("429 Too Many Requests")).toBe(true);
    });

    it("should return false for non-rate-limit errors", () => {
      expect(isRateLimitError(new Error("Connection timeout"))).toBe(false);
    });

    it("should handle non-Error objects", () => {
      expect(isRateLimitError({ message: "429" })).toBe(true);
    });
  });

  describe("isTransientError", () => {
    it("should detect timeout errors", () => {
      expect(isTransientError(new Error("Request timeout"))).toBe(true);
    });

    it("should detect connection refused", () => {
      expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
    });

    it("should detect connection reset", () => {
      expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    });

    it("should detect temporarily unavailable", () => {
      expect(isTransientError(new Error("Service temporarily unavailable"))).toBe(true);
    });

    it("should detect 503 Service Unavailable", () => {
      expect(isTransientError(new Error("HTTP 503 Service Unavailable"))).toBe(true);
    });

    it("should detect 502 Bad Gateway", () => {
      expect(isTransientError(new Error("HTTP 502 Bad Gateway"))).toBe(true);
    });

    it("should detect 504 Gateway Timeout", () => {
      expect(isTransientError(new Error("HTTP 504 Gateway Timeout"))).toBe(true);
    });

    it("should return false for permanent errors", () => {
      expect(isTransientError(new Error("Invalid contract ID"))).toBe(false);
    });

    it("should handle non-Error objects", () => {
      expect(isTransientError({ message: "timeout" })).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(isTransientError(new Error("TIMEOUT"))).toBe(true);
      expect(isTransientError(new Error("Timeout"))).toBe(true);
    });
  });

  describe("DEFAULT_POLLING_CONFIG", () => {
    it("should have reasonable defaults", () => {
      expect(DEFAULT_POLLING_CONFIG.minIntervalMs).toBeLessThan(
        DEFAULT_POLLING_CONFIG.maxIntervalMs,
      );
      expect(DEFAULT_POLLING_CONFIG.initialBackoffMs).toBeLessThan(
        DEFAULT_POLLING_CONFIG.maxBackoffMs,
      );
      expect(DEFAULT_POLLING_CONFIG.maxBatchSize).toBeGreaterThan(0);
      expect(DEFAULT_POLLING_CONFIG.lagThresholdLedgers).toBeGreaterThan(0);
    });

    it("should have multipliers greater than 1", () => {
      expect(DEFAULT_POLLING_CONFIG.rateLimitBackoffMultiplier).toBeGreaterThan(1);
      expect(DEFAULT_POLLING_CONFIG.transientErrorBackoffMultiplier).toBeGreaterThan(1);
    });
  });
});

import { Job } from "bullmq";
import { WebhookProcessor, WebhookDeliveryJob } from "./webhook.processor";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { WebhookDeadLetterService } from "./webhook-dlq.service";

describe("WebhookProcessor", () => {
  let processor: WebhookProcessor;
  let deliveryRepo: jest.Mocked<{ save: jest.Mock; create: jest.Mock }>;
  let dlqService: jest.Mocked<WebhookDeadLetterService>;

  beforeEach(async () => {
    deliveryRepo = {
      save: jest.fn(),
      create: jest.fn((e) => e as WebhookDeliveryEntity),
    };

    dlqService = {
      record: jest.fn(),
    } as any;

    processor = new WebhookProcessor(
      deliveryRepo as any,
      dlqService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("process", () => {
    it("records successful delivery on 200 OK", async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      const job = {
        data: {
          url: "https://example.com/hook",
          eventType: "RaffleCreated",
          payload: { raffleId: 1 },
        },
        attemptsMade: 0,
      } as unknown as Job<WebhookDeliveryJob>;

      await processor.process(job);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/hook",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "success",
          attempts: 1,
        }),
      );
    });

    it("throws and records failure on non-OK response", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      global.fetch = mockFetch;

      const job = {
        data: {
          url: "https://example.com/hook",
          eventType: "RaffleCreated",
          payload: { raffleId: 1 },
        },
        attemptsMade: 0,
      } as unknown as Job<WebhookDeliveryJob>;

      await expect(processor.process(job)).rejects.toThrow("HTTP Error: 500");

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorResponse: expect.stringContaining("500"),
        }),
      );
    });

    it("throws and records failure on network error", async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      global.fetch = mockFetch;

      const job = {
        data: {
          url: "https://example.com/hook",
          eventType: "RaffleCreated",
          payload: { raffleId: 1 },
        },
        attemptsMade: 0,
      } as unknown as Job<WebhookDeliveryJob>;

      await expect(processor.process(job)).rejects.toThrow("ECONNREFUSED");

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorResponse: "ECONNREFUSED",
        }),
      );
    });
  });

  describe("onFailed", () => {
    it("records dead-letter entry on exhaustion", async () => {
      const job = {
        data: {
          url: "https://example.com/hook",
          eventType: "RaffleCreated",
          payload: { raffleId: 1 },
        },
        attemptsMade: 5,
      } as unknown as Job<WebhookDeliveryJob>;

      await processor.onFailed(job, new Error("HTTP Error: 500"));

      expect(dlqService.record).toHaveBeenCalledWith(
        "https://example.com/hook",
        "RaffleCreated",
        { raffleId: 1 },
        "HTTP Error: 500",
        expect.any(String),
        5,
      );
    });

    it("classifies timeout errors as TIMEOUT", async () => {
      const job = {
        data: { url: "", eventType: "", payload: {} },
        attemptsMade: 3,
      } as unknown as Job<WebhookDeliveryJob>;

      await processor.onFailed(job, new Error("timeout exceeded"));

      expect(dlqService.record).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        "TIMEOUT",
        expect.any(Number),
      );
    });

    it("classifies network errors as NETWORK_ERROR", async () => {
      const job = {
        data: { url: "", eventType: "", payload: {} },
        attemptsMade: 3,
      } as unknown as Job<WebhookDeliveryJob>;

      await processor.onFailed(job, new Error("network error"));

      expect(dlqService.record).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        "NETWORK_ERROR",
        expect.any(Number),
      );
    });
  });
});

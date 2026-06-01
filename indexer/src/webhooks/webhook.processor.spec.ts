import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Job } from "bullmq";
import { WebhookProcessor } from "./webhook.processor";
import {
  WebhookDeliveryEntity,
  DeliveryStatus,
} from "./webhook-delivery.entity";
import { WebhookEntity } from "../database/entities/webhook.entity";

// Mock fetch globally
global.fetch = jest.fn();

describe("WebhookProcessor", () => {
  let processor: WebhookProcessor;
  let deliveryRepo: jest.Mocked<Repository<WebhookDeliveryEntity>>;
  let webhookRepo: jest.Mocked<Repository<WebhookEntity>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        {
          provide: getRepositoryToken(WebhookDeliveryEntity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve(entity)),
          },
        },
        {
          provide: getRepositoryToken(WebhookEntity),
          useValue: {
            save: jest.fn((entity) => Promise.resolve(entity)),
          },
        },
      ],
    }).compile();

    processor = module.get<WebhookProcessor>(WebhookProcessor);
    deliveryRepo = module.get(getRepositoryToken(WebhookDeliveryEntity));
    webhookRepo = module.get(getRepositoryToken(WebhookEntity));

    (global.fetch as jest.Mock).mockClear();
  });

  const createMockJob = (deliveryId: string): Job => {
    return {
      data: { deliveryId },
    } as Job;
  };

  const createMockDelivery = (
    overrides?: Partial<WebhookDeliveryEntity>,
  ): WebhookDeliveryEntity => {
    return {
      id: "delivery-1",
      eventId: "event-123",
      eventType: "RaffleCreated",
      payload: { name: "Test" },
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
      maxAttempts: 5,
      createdAt: new Date(),
      webhook: {
        id: "webhook-1",
        url: "https://example.com/webhook",
        signingSecret: "test-secret",
        failureCount: 0,
      } as WebhookEntity,
      ...overrides,
    } as WebhookDeliveryEntity;
  };

  describe("successful delivery", () => {
    it("should mark delivery as success on 200 response", async () => {
      const mockDelivery = createMockDelivery();
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const job = createMockJob("delivery-1");
      await processor.process(job);

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DeliveryStatus.SUCCESS,
          deliveredAt: expect.any(Date),
          attemptCount: 1,
        }),
      );
    });

    it("should include signature and event headers", async () => {
      const mockDelivery = createMockDelivery();
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const job = createMockJob("delivery-1");
      await processor.process(job);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Webhook-Signature": expect.any(String),
            "X-Event-Id": "event-123",
            "X-Event-Type": "RaffleCreated",
            "User-Agent": "Tikka-Indexer-Webhook/1.0",
          }),
        }),
      );
    });

    it("should send correct payload structure", async () => {
      const mockDelivery = createMockDelivery({
        payload: { raffleId: 123, name: "Test Raffle" },
      });
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const job = createMockJob("delivery-1");
      await processor.process(job);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body).toEqual({
        eventId: "event-123",
        eventType: "RaffleCreated",
        timestamp: expect.any(String),
        data: { raffleId: 123, name: "Test Raffle" },
      });
    });
  });

  describe("retry logic", () => {
    it("should retry on failure and update status", async () => {
      const mockDelivery = createMockDelivery();
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockRejectedValue(
        Object.assign(new Error("Network error"), { statusCode: 500 }),
      );

      const job = createMockJob("delivery-1");

      await expect(processor.process(job)).rejects.toThrow("Network error");

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DeliveryStatus.FAILED,
          attemptCount: 1,
          lastError: "Network error",
          nextRetryAt: expect.any(Date),
        }),
      );
    });

    it("should calculate exponential backoff for retries", async () => {
      const mockDelivery = createMockDelivery({ attemptCount: 2 });
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockRejectedValue(new Error("Timeout"));

      const job = createMockJob("delivery-1");

      await expect(processor.process(job)).rejects.toThrow();

      const savedDelivery = (deliveryRepo.save as jest.Mock).mock.calls[1][0];
      const nextRetry = savedDelivery.nextRetryAt.getTime();
      const now = Date.now();

      // Should be ~4 seconds (2^2 * 1000ms)
      expect(nextRetry - now).toBeGreaterThan(3000);
      expect(nextRetry - now).toBeLessThan(5000);
    });
  });

  describe("permanent failure", () => {
    it("should mark as permanent failure after max attempts", async () => {
      const mockDelivery = createMockDelivery({
        attemptCount: 4,
        maxAttempts: 5,
      });
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockRejectedValue(
        Object.assign(new Error("Service unavailable"), { statusCode: 503 }),
      );

      const job = createMockJob("delivery-1");

      await expect(processor.process(job)).rejects.toThrow();

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DeliveryStatus.PERMANENT_FAILURE,
          attemptCount: 5,
          nextRetryAt: null,
        }),
      );
    });

    it("should update webhook failure count on permanent failure", async () => {
      const mockDelivery = createMockDelivery({
        attemptCount: 4,
        maxAttempts: 5,
      });
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockRejectedValue(new Error("Failed"));

      const job = createMockJob("delivery-1");

      await expect(processor.process(job)).rejects.toThrow();

      expect(webhookRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failureCount: 1,
          lastFailureAt: expect.any(Date),
        }),
      );
    });
  });

  describe("duplicate suppression", () => {
    it("should skip already successful deliveries", async () => {
      const mockDelivery = createMockDelivery({
        status: DeliveryStatus.SUCCESS,
      });
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      const job = createMockJob("delivery-1");
      await processor.process(job);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(deliveryRepo.save).not.toHaveBeenCalled();
    });

    it("should skip permanently failed deliveries", async () => {
      const mockDelivery = createMockDelivery({
        status: DeliveryStatus.PERMANENT_FAILURE,
      });
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      const job = createMockJob("delivery-1");
      await processor.process(job);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(deliveryRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle missing delivery gracefully", async () => {
      deliveryRepo.findOne.mockResolvedValue(null);

      const job = createMockJob("non-existent");
      await processor.process(job);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should handle webhook without signing secret", async () => {
      const mockDelivery = createMockDelivery();
      mockDelivery.webhook.signingSecret = undefined;
      deliveryRepo.findOne.mockResolvedValue(mockDelivery);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const job = createMockJob("delivery-1");
      await processor.process(job);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers["X-Webhook-Signature"]).toBe("");
    });
  });
});

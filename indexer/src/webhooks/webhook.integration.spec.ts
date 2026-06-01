import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { WebhookService } from "./webhook.service";
import { WebhookProcessor } from "./webhook.processor";
import { WebhookEntity } from "../database/entities/webhook.entity";
import {
  WebhookDeliveryEntity,
  DeliveryStatus,
} from "./webhook-delivery.entity";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";

// Mock fetch for integration tests
global.fetch = jest.fn();

describe("Webhook Integration", () => {
  let module: TestingModule;
  let webhookService: WebhookService;
  let webhookProcessor: WebhookProcessor;
  let webhookRepo: Repository<WebhookEntity>;
  let deliveryRepo: Repository<WebhookDeliveryEntity>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "sqlite",
          database: ":memory:",
          entities: [WebhookEntity, WebhookDeliveryEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([WebhookEntity, WebhookDeliveryEntity]),
        BullModule.forRoot({
          connection: {
            host: "localhost",
            port: 6379,
          },
        }),
        BullModule.registerQueue({
          name: "webhook",
        }),
      ],
      providers: [WebhookService, WebhookProcessor],
    }).compile();

    webhookService = module.get<WebhookService>(WebhookService);
    webhookProcessor = module.get<WebhookProcessor>(WebhookProcessor);
    webhookRepo = module.get(getRepositoryToken(WebhookEntity));
    deliveryRepo = module.get(getRepositoryToken(WebhookDeliveryEntity));
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await deliveryRepo.clear();
    await webhookRepo.clear();
    (global.fetch as jest.Mock).mockClear();
  });

  describe("End-to-End Webhook Flow", () => {
    it("should register webhook, dispatch event, and deliver successfully", async () => {
      // 1. Register webhook
      const webhook = await webhookService.registerWebhook(
        "https://example.com/webhook",
        ["RaffleCreated"],
      );

      expect(webhook.signingSecret).toBeDefined();
      expect(webhook.isActive).toBe(true);

      // 2. Dispatch event
      await webhookService.dispatchEvent({
        eventType: "RaffleCreated",
        raffleId: 123,
        timestamp: new Date(),
        data: { name: "Test Raffle" },
      });

      // 3. Verify delivery record created
      const deliveries = await deliveryRepo.find();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe(DeliveryStatus.PENDING);
      expect(deliveries[0].eventId).toBeDefined();

      // 4. Mock successful HTTP response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      // 5. Process delivery
      await webhookProcessor.process({
        data: { deliveryId: deliveries[0].id },
      } as any);

      // 6. Verify successful delivery
      const updatedDelivery = await deliveryRepo.findOne({
        where: { id: deliveries[0].id },
      });
      expect(updatedDelivery?.status).toBe(DeliveryStatus.SUCCESS);
      expect(updatedDelivery?.deliveredAt).toBeDefined();
      expect(updatedDelivery?.attemptCount).toBe(1);
    });

    it("should suppress duplicate events", async () => {
      await webhookService.registerWebhook("https://example.com/webhook", [
        "RaffleCreated",
      ]);

      const payload = {
        eventType: "RaffleCreated" as const,
        raffleId: 456,
        timestamp: new Date("2024-01-01T00:00:00Z"),
        data: { name: "Duplicate Test" },
      };

      // Dispatch same event twice
      await webhookService.dispatchEvent(payload);
      await webhookService.dispatchEvent(payload);

      // Should only create one delivery
      const deliveries = await deliveryRepo.find();
      expect(deliveries).toHaveLength(1);
    });

    it("should retry failed deliveries", async () => {
      await webhookService.registerWebhook("https://example.com/webhook", [
        "RaffleCreated",
      ]);

      await webhookService.dispatchEvent({
        eventType: "RaffleCreated",
        raffleId: 789,
        timestamp: new Date(),
        data: { name: "Retry Test" },
      });

      const deliveries = await deliveryRepo.find();
      const deliveryId = deliveries[0].id;

      // First attempt fails
      (global.fetch as jest.Mock).mockRejectedValue(
        Object.assign(new Error("Network timeout"), { statusCode: 504 }),
      );

      await expect(
        webhookProcessor.process({
          data: { deliveryId },
        } as any),
      ).rejects.toThrow();

      let delivery = await deliveryRepo.findOne({ where: { id: deliveryId } });
      expect(delivery?.status).toBe(DeliveryStatus.FAILED);
      expect(delivery?.attemptCount).toBe(1);
      expect(delivery?.nextRetryAt).toBeDefined();

      // Second attempt succeeds
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await webhookProcessor.process({
        data: { deliveryId },
      } as any);

      delivery = await deliveryRepo.findOne({ where: { id: deliveryId } });
      expect(delivery?.status).toBe(DeliveryStatus.SUCCESS);
      expect(delivery?.attemptCount).toBe(2);
    });

    it("should mark as permanent failure after max attempts", async () => {
      const webhook = await webhookService.registerWebhook(
        "https://example.com/webhook",
        ["RaffleCreated"],
      );

      await webhookService.dispatchEvent({
        eventType: "RaffleCreated",
        raffleId: 999,
        timestamp: new Date(),
        data: { name: "Permanent Failure Test" },
      });

      const deliveries = await deliveryRepo.find();
      const deliveryId = deliveries[0].id;

      // Mock persistent failure
      (global.fetch as jest.Mock).mockRejectedValue(
        Object.assign(new Error("Service unavailable"), { statusCode: 503 }),
      );

      // Attempt 5 times
      for (let i = 0; i < 5; i++) {
        try {
          await webhookProcessor.process({
            data: { deliveryId },
          } as any);
        } catch (error) {
          // Expected to throw on retries
        }
      }

      const delivery = await deliveryRepo.findOne({
        where: { id: deliveryId },
      });
      expect(delivery?.status).toBe(DeliveryStatus.PERMANENT_FAILURE);
      expect(delivery?.attemptCount).toBe(5);
      expect(delivery?.nextRetryAt).toBeNull();

      // Verify webhook failure count updated
      const updatedWebhook = await webhookRepo.findOne({
        where: { id: webhook.id },
      });
      expect(updatedWebhook?.failureCount).toBeGreaterThan(0);
      expect(updatedWebhook?.lastFailureAt).toBeDefined();
    });

    it("should deliver to multiple webhooks for same event", async () => {
      await webhookService.registerWebhook("https://webhook1.com/hook", [
        "RaffleCreated",
      ]);
      await webhookService.registerWebhook("https://webhook2.com/hook", [
        "RaffleCreated",
      ]);

      await webhookService.dispatchEvent({
        eventType: "RaffleCreated",
        raffleId: 111,
        timestamp: new Date(),
        data: { name: "Multi Webhook Test" },
      });

      const deliveries = await deliveryRepo.find({ relations: ["webhook"] });
      expect(deliveries).toHaveLength(2);

      const urls = deliveries.map((d) => d.webhook.url).sort();
      expect(urls).toEqual([
        "https://webhook1.com/hook",
        "https://webhook2.com/hook",
      ]);
    });
  });
});

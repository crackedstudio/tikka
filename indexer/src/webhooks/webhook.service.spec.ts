import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { getQueueToken } from "@nestjs/bullmq";
import { Repository } from "typeorm";
import { Queue } from "bullmq";
import { WebhookService, WebhookPayload } from "./webhook.service";
import { WebhookEntity } from "../database/entities/webhook.entity";
import {
  WebhookDeliveryEntity,
  DeliveryStatus,
} from "./webhook-delivery.entity";

describe("WebhookService", () => {
  let service: WebhookService;
  let webhookRepo: jest.Mocked<Repository<WebhookEntity>>;
  let deliveryRepo: jest.Mocked<Repository<WebhookDeliveryEntity>>;
  let webhookQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: getRepositoryToken(WebhookEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WebhookDeliveryEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve(data)),
          },
        },
        {
          provide: getQueueToken("webhook"),
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    webhookRepo = module.get(getRepositoryToken(WebhookEntity));
    deliveryRepo = module.get(getRepositoryToken(WebhookDeliveryEntity));
    webhookQueue = module.get(getQueueToken("webhook"));
  });

  describe("dispatchEvent", () => {
    const mockPayload: WebhookPayload = {
      eventType: "RaffleCreated",
      raffleId: 123,
      timestamp: new Date("2024-01-01T00:00:00Z"),
      data: { name: "Test Raffle" },
    };

    it("should create delivery records and queue jobs for active webhooks", async () => {
      const mockWebhooks = [
        {
          id: "webhook-1",
          url: "https://example.com/webhook",
          supportedEvents: ["RaffleCreated"],
          isActive: true,
        },
        {
          id: "webhook-2",
          url: "https://example2.com/webhook",
          supportedEvents: ["RaffleCreated"],
          isActive: true,
        },
      ] as WebhookEntity[];

      webhookRepo.find.mockResolvedValue(mockWebhooks);
      deliveryRepo.findOne.mockResolvedValue(null);

      await service.dispatchEvent(mockPayload);

      expect(deliveryRepo.create).toHaveBeenCalledTimes(2);
      expect(deliveryRepo.save).toHaveBeenCalledTimes(2);
      expect(webhookQueue.add).toHaveBeenCalledTimes(2);

      expect(deliveryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook: mockWebhooks[0],
          eventType: "RaffleCreated",
          payload: mockPayload.data,
          status: DeliveryStatus.PENDING,
          attemptCount: 0,
          maxAttempts: 5,
        }),
      );
    });

    it("should suppress duplicate events using eventId", async () => {
      const existingDelivery = {
        id: "delivery-1",
        eventId: "some-event-id",
      } as WebhookDeliveryEntity;

      deliveryRepo.findOne.mockResolvedValue(existingDelivery);

      await service.dispatchEvent(mockPayload);

      expect(webhookRepo.find).not.toHaveBeenCalled();
      expect(deliveryRepo.create).not.toHaveBeenCalled();
      expect(webhookQueue.add).not.toHaveBeenCalled();
    });

    it("should generate consistent eventId for same payload", async () => {
      const mockWebhook = {
        id: "webhook-1",
        url: "https://example.com/webhook",
        supportedEvents: ["RaffleCreated"],
        isActive: true,
      } as WebhookEntity;

      webhookRepo.find.mockResolvedValue([mockWebhook]);
      deliveryRepo.findOne.mockResolvedValue(null);

      await service.dispatchEvent(mockPayload);
      const firstEventId = (deliveryRepo.create as jest.Mock).mock.calls[0][0]
        .eventId;

      await service.dispatchEvent(mockPayload);
      const secondEventId = (deliveryRepo.create as jest.Mock).mock.calls[1][0]
        .eventId;

      expect(firstEventId).toBe(secondEventId);
    });

    it("should not dispatch to inactive webhooks", async () => {
      webhookRepo.find.mockResolvedValue([]);

      await service.dispatchEvent(mockPayload);

      expect(deliveryRepo.create).not.toHaveBeenCalled();
      expect(webhookQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("registerWebhook", () => {
    it("should create webhook with signing secret", async () => {
      const url = "https://example.com/webhook";
      const events: ("RaffleCreated" | "RaffleFinalized")[] = [
        "RaffleCreated",
      ];

      const mockWebhook = {
        id: "webhook-1",
        url,
        supportedEvents: events,
        signingSecret: "generated-secret",
      } as WebhookEntity;

      webhookRepo.create.mockReturnValue(mockWebhook);
      webhookRepo.save.mockResolvedValue(mockWebhook);

      const result = await service.registerWebhook(url, events);

      expect(webhookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url,
          supportedEvents: events,
          signingSecret: expect.any(String),
        }),
      );
      expect(result.signingSecret).toBeDefined();
    });

    it("should use provided signing secret if given", async () => {
      const url = "https://example.com/webhook";
      const events: ("RaffleCreated" | "RaffleFinalized")[] = [
        "RaffleCreated",
      ];
      const customSecret = "my-custom-secret";

      const mockWebhook = {
        id: "webhook-1",
        url,
        supportedEvents: events,
        signingSecret: customSecret,
      } as WebhookEntity;

      webhookRepo.create.mockReturnValue(mockWebhook);
      webhookRepo.save.mockResolvedValue(mockWebhook);

      await service.registerWebhook(url, events, customSecret);

      expect(webhookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          signingSecret: customSecret,
        }),
      );
    });
  });

  describe("getDeliveryStatus", () => {
    it("should return all deliveries for an event", async () => {
      const eventId = "test-event-id";
      const mockDeliveries = [
        {
          id: "delivery-1",
          eventId,
          status: DeliveryStatus.SUCCESS,
        },
        {
          id: "delivery-2",
          eventId,
          status: DeliveryStatus.FAILED,
        },
      ] as WebhookDeliveryEntity[];

      deliveryRepo.find.mockResolvedValue(mockDeliveries);

      const result = await service.getDeliveryStatus(eventId);

      expect(result).toEqual(mockDeliveries);
      expect(deliveryRepo.find).toHaveBeenCalledWith({
        where: { eventId },
        relations: ["webhook"],
      });
    });
  });
});

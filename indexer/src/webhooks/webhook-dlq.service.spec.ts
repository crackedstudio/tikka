import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { getQueueToken } from "@nestjs/bullmq";
import { Repository } from "typeorm";
import { WebhookDeadLetterService } from "./webhook-dlq.service";
import { WebhookDeadLetterEntity, WebhookDlqReason } from "../database/entities/webhook-dead-letter.entity";

function makeEntry(overrides: Partial<WebhookDeadLetterEntity> = {}): WebhookDeadLetterEntity {
  return {
    id: `uuid-${Math.random().toString(36).slice(2)}`,
    webhookUrl: "https://example.com/hook",
    eventType: "RaffleCreated",
    payload: { raffleId: 1 },
    errorResponse: "HTTP Error: 500",
    reason: WebhookDlqReason.HTTP_ERROR,
    retryCount: 5,
    retryable: true,
    replayedAt: undefined,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WebhookDeadLetterEntity;
}

describe("WebhookDeadLetterService", () => {
  let service: WebhookDeadLetterService;
  let repo: jest.Mocked<Repository<WebhookDeadLetterEntity>>;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    repo = {
      save: jest.fn(),
      create: jest.fn((e) => e as WebhookDeadLetterEntity),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as any;

    queue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeadLetterService,
        { provide: getRepositoryToken(WebhookDeadLetterEntity), useValue: repo },
        { provide: getQueueToken("webhook"), useValue: queue },
      ],
    }).compile();

    service = module.get<WebhookDeadLetterService>(WebhookDeadLetterService);
  });

  describe("record", () => {
    it("persists a dead-letter entry with default reason", async () => {
      repo.save.mockResolvedValue(makeEntry());

      await service.record(
        "https://example.com/hook",
        "RaffleCreated",
        { raffleId: 1 },
        "HTTP Error: 500",
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookUrl: "https://example.com/hook",
          eventType: "RaffleCreated",
          reason: WebhookDlqReason.HTTP_ERROR,
          retryable: true,
          status: "pending",
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it("accepts explicit reason and retryCount", async () => {
      repo.save.mockResolvedValue(makeEntry());

      await service.record(
        "https://example.com/hook",
        "RaffleFinalized",
        { raffleId: 2 },
        "Timeout",
        WebhookDlqReason.TIMEOUT,
        3,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: WebhookDlqReason.TIMEOUT,
          retryCount: 3,
        }),
      );
    });
  });

  describe("listPending", () => {
    it("returns pending retryable entries not yet replayed", async () => {
      const entries = [makeEntry(), makeEntry()];
      repo.find.mockResolvedValue(entries);

      const result = await service.listPending();

      expect(result).toHaveLength(2);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "pending", retryable: true, replayedAt: expect.anything() },
        }),
      );
    });
  });

  describe("replay", () => {
    it("re-enqueues the delivery and marks as replayed", async () => {
      const entry = makeEntry();
      repo.findOne.mockResolvedValue(entry);
      repo.save.mockResolvedValue(entry);

      const ok = await service.replay(entry.id);

      expect(ok).toBe(true);
      expect(queue.add).toHaveBeenCalledWith(
        "deliver",
        {
          url: entry.webhookUrl,
          eventType: entry.eventType,
          payload: entry.payload,
        },
        expect.objectContaining({
          jobId: expect.stringContaining(entry.id),
        }),
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: "replayed", replayedAt: expect.any(Date) }),
      );
    });

    it("returns false when entry is not found", async () => {
      repo.findOne.mockResolvedValue(null);
      const ok = await service.replay("nonexistent");
      expect(ok).toBe(false);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("returns false when entry is not retryable", async () => {
      repo.findOne.mockResolvedValue(makeEntry({ retryable: false }));
      const ok = await service.replay("id");
      expect(ok).toBe(false);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe("replayAll", () => {
    it("replays all pending entries and returns counts", async () => {
      const entries = [makeEntry({ id: "1" }), makeEntry({ id: "2" })];
      repo.find.mockResolvedValue(entries);
      repo.findOne.mockResolvedValueOnce(makeEntry({ id: "1" }));
      repo.findOne.mockResolvedValueOnce(makeEntry({ id: "2" }));
      repo.save.mockResolvedValue(makeEntry());

      const result = await service.replayAll();

      expect(result.replayed).toBe(2);
      expect(queue.add).toHaveBeenCalledTimes(2);
    });
  });
});

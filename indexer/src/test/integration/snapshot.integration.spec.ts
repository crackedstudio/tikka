import { DataSource, Repository } from "typeorm";
import { SnapshotService } from "../../maintenance/snapshot.service";
import { RaffleEntity, RaffleStatus } from "../../database/entities/raffle.entity";
import { TicketEntity } from "../../database/entities/ticket.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { IndexerCursorEntity } from "../../database/entities/indexer-cursor.entity";
import { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import {
  DeadLetterEventEntity,
  DlqReason,
} from "../../database/entities/dead-letter-event.entity";
import { PlatformStatEntity } from "../../database/entities/platform-stat.entity";
import { PlatformStateEntity } from "../../database/entities/platform-state.entity";
import { WebhookEntity } from "../../database/entities/webhook.entity";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../../database/entities/archive-checkpoint.entity";
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from "./helpers/db-container";
import { ConfigService } from "@nestjs/config";

/**
 * S3 client `send` mock, wired into the module factory below.
 *
 * Name deliberately starts with `mock` so the `jest.mock(...)` factory (which
 * is hoisted) may reference it. SnapshotService constructs its S3Client lazily
 * on the first export/import, so we can't grab the client from `mock.results`
 * in `beforeAll` — instead the factory returns a shared client whose `send` we
 * configure here.
 */
const mockS3Send = jest.fn().mockRejectedValue(new Error("S3 not yet configured"));

jest.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockS3Send,
    })),
    // Return the input object from `new PutObjectCommand(...)` / `new
    // GetObjectCommand(...)` so the send mock can inspect it. A plain `jest.fn()`
    // would yield `undefined` here and break the round-trip.
    PutObjectCommand: jest
      .fn()
      .mockImplementation((input: any) => ({ input })),
    GetObjectCommand: jest
      .fn()
      .mockImplementation((input: any) => ({ input })),
  };
});

const ALL_TABLES = [
  "tickets",
  "raffle_events",
  "dead_letter_events",
  "users",
  "raffles",
  "indexer_cursor",
  "platform_stats",
  "platform_state",
  "webhooks",
  "archive_checkpoints",
].join(", ");

describe("SnapshotService Integration", () => {
  let ctx: DbContainerContext;
  let ds: DataSource;
  let snapshotService: SnapshotService;
  let configService: ConfigService;

  let raffleRepo: Repository<RaffleEntity>;
  let ticketRepo: Repository<TicketEntity>;
  let userRepo: Repository<UserEntity>;
  let cursorRepo: Repository<IndexerCursorEntity>;
  let raffleEventRepo: Repository<RaffleEventEntity>;
  let deadLetterRepo: Repository<DeadLetterEventEntity>;
  let platformStatRepo: Repository<PlatformStatEntity>;
  let platformStateRepo: Repository<PlatformStateEntity>;
  let webhookRepo: Repository<WebhookEntity>;
  let archiveCheckpointRepo: Repository<ArchiveCheckpointEntity>;

  let mockS3Store: Record<string, Buffer> = {};

  beforeAll(async () => {
    ctx = await startDb();
    ds = ctx.dataSource;

    raffleRepo = ds.getRepository(RaffleEntity);
    ticketRepo = ds.getRepository(TicketEntity);
    userRepo = ds.getRepository(UserEntity);
    cursorRepo = ds.getRepository(IndexerCursorEntity);
    raffleEventRepo = ds.getRepository(RaffleEventEntity);
    deadLetterRepo = ds.getRepository(DeadLetterEventEntity);
    platformStatRepo = ds.getRepository(PlatformStatEntity);
    platformStateRepo = ds.getRepository(PlatformStateEntity);
    webhookRepo = ds.getRepository(WebhookEntity);
    archiveCheckpointRepo = ds.getRepository(ArchiveCheckpointEntity);

    configService = {
      get: jest.fn((key: string) => {
        if (key === "SNAPSHOT_STORAGE_URL") return "s3://test-bucket/snapshots";
        if (key === "AWS_REGION") return "us-east-1";
        return null;
      }),
    } as any;

    snapshotService = new SnapshotService(
      ds,
      raffleRepo,
      ticketRepo,
      userRepo,
      cursorRepo,
      raffleEventRepo,
      deadLetterRepo,
      platformStatRepo,
      platformStateRepo,
      webhookRepo,
      archiveCheckpointRepo,
      configService,
    );

    mockS3Send.mockImplementation(async (command: any) => {
      const input = command.input ?? command;
      const key = input.Key;
      // A PutObjectCommand carries a `Body`; GetObjectCommand does not.
      if (input.Body !== undefined) {
        mockS3Store[key] = input.Body;
        return {};
      } else {
        if (!mockS3Store[key]) throw new Error("Not found");
        return {
          Body: {
            async *[Symbol.asyncIterator]() {
              yield mockS3Store[key];
            },
          },
        };
      }
    });
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => stopDb(ctx));

  beforeEach(async () => {
    mockS3Store = {};
    mockS3Send.mockClear();
    await ds.query(`SET session_replication_role = 'replica'`);
    await ds.query(`TRUNCATE TABLE ${ALL_TABLES} RESTART IDENTITY CASCADE`);
    await ds.query(`SET session_replication_role = 'origin'`);
  });

  async function seedAllEntityTypes() {
    const user = userRepo.create({
      address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
      totalTicketsBought: 5,
      totalRafflesEntered: 1,
      totalRafflesWon: 0,
      totalPrizeXlm: "0",
      firstSeenLedger: 1000,
      lastTxHash: "TX_USER_SEED",
    });
    await userRepo.save(user);

    const raffle = raffleRepo.create({
      id: 1,
      creator: user.address,
      status: RaffleStatus.OPEN,
      ticketPrice: "100",
      maxTickets: 100,
      asset: "XLM",
      endTime: String(Math.floor(new Date("2030-01-01T00:00:00Z").getTime() / 1000)),
      createdLedger: 1000,
      ticketsSold: 1,
    });
    await raffleRepo.save(raffle);

    const ticket = ticketRepo.create({
      id: 101,
      raffleId: 1,
      owner: user.address,
      purchaseTxHash: "TX123",
      purchasedAtLedger: 1005,
    });
    await ticketRepo.save(ticket);

    const cursor = cursorRepo.create({
      id: 1,
      lastLedger: 1010,
      lastPagingToken: "token123",
      ledgerHashes: [{ ledger: 1010, hash: "abc" }],
      processedEventCount: 3,
      checkpointVersion: 1,
    });
    await cursorRepo.save(cursor);

    const raffleEvent = raffleEventRepo.create({
      raffleId: 1,
      eventType: "RaffleCreated",
      contractAddress: "CCONTRACT",
      schemaVersion: 1,
      ledger: 1000,
      txHash: "TX_EVENT_1",
      payloadJson: { raffle_id: 1 },
    });
    await raffleEventRepo.save(raffleEvent);

    const dlq = deadLetterRepo.create({
      ledger: 1008,
      contractId: "CCONTRACT",
      eventType: "TicketPurchased",
      rawPayload: { broken: true },
      errorMessage: "parse failed",
      reason: DlqReason.PARSE_ERROR,
      retryable: true,
      retryCount: 0,
      attemptCount: 1,
      replayedAt: null,
    });
    await deadLetterRepo.save(dlq);

    const stat = platformStatRepo.create({
      date: "2026-07-27",
      totalRaffles: 1,
      totalTickets: 1,
      totalVolumeXlm: "100",
      uniqueParticipants: 1,
      prizesDistributedXlm: "0",
    });
    await platformStatRepo.save(stat);

    const platformState = platformStateRepo.create({
      id: "global",
      paused: false,
      adminAddress: user.address,
      pendingAdminAddress: null,
      lastUpdatedLedger: 1000,
    });
    await platformStateRepo.save(platformState);

    const webhook = webhookRepo.create({
      url: "https://hooks.example.com/tikka",
      supportedEvents: ["RaffleCreated", "RaffleFinalized"],
      isActive: true,
      failureCount: 0,
    });
    await webhookRepo.save(webhook);

    const checkpoint = archiveCheckpointRepo.create({
      jobType: "raffle_events",
      lastProcessedTimestamp: new Date("2026-01-01T00:00:00Z"),
      lastProcessedId: null,
      totalArchived: 10,
      batchNumber: 2,
      status: ArchiveJobStatus.COMPLETED,
      configSnapshot: {
        retentionDays: 30,
        batchSize: 1000,
        cutoffDate: "2026-01-01",
      },
      completedAt: new Date("2026-01-02T00:00:00Z"),
      integrityHash: null,
      lastVerifiedAt: null,
      verificationFailureReason: null,
    });
    await archiveCheckpointRepo.save(checkpoint);

    return {
      user,
      raffle,
      ticket,
      cursor,
      raffleEvent,
      dlq,
      stat,
      platformState,
      webhook,
      checkpoint,
    };
  }

  it("round-trips a snapshot preserving all entity types (export → wipe → import)", async () => {
    const seeded = await seedAllEntityTypes();

    const expectedCounts = {
      users: 1,
      raffles: 1,
      tickets: 1,
      cursors: 1,
      raffleEvents: 1,
      deadLetterEvents: 1,
      platformStats: 1,
      platformState: 1,
      webhooks: 1,
      archiveCheckpoints: 1,
    };

    // Export
    const filename = await snapshotService.exportSnapshot();
    expect(filename).toBeDefined();
    expect(mockS3Store[`snapshots/${filename}`]).toBeDefined();

    // Wipe
    await ds.query(`SET session_replication_role = 'replica'`);
    await ds.query(`TRUNCATE TABLE ${ALL_TABLES} RESTART IDENTITY CASCADE`);
    await ds.query(`SET session_replication_role = 'origin'`);

    expect(await userRepo.count()).toBe(0);
    expect(await raffleRepo.count()).toBe(0);
    expect(await ticketRepo.count()).toBe(0);
    expect(await cursorRepo.count()).toBe(0);
    expect(await raffleEventRepo.count()).toBe(0);
    expect(await deadLetterRepo.count()).toBe(0);
    expect(await platformStatRepo.count()).toBe(0);
    expect(await platformStateRepo.count()).toBe(0);
    expect(await webhookRepo.count()).toBe(0);
    expect(await archiveCheckpointRepo.count()).toBe(0);

    // Import
    const manifest = await snapshotService.importSnapshot(filename);

    // Row counts
    expect(await userRepo.count()).toBe(expectedCounts.users);
    expect(await raffleRepo.count()).toBe(expectedCounts.raffles);
    expect(await ticketRepo.count()).toBe(expectedCounts.tickets);
    expect(await cursorRepo.count()).toBe(expectedCounts.cursors);
    expect(await raffleEventRepo.count()).toBe(expectedCounts.raffleEvents);
    expect(await deadLetterRepo.count()).toBe(expectedCounts.deadLetterEvents);
    expect(await platformStatRepo.count()).toBe(expectedCounts.platformStats);
    expect(await platformStateRepo.count()).toBe(expectedCounts.platformState);
    expect(await webhookRepo.count()).toBe(expectedCounts.webhooks);
    expect(await archiveCheckpointRepo.count()).toBe(expectedCounts.archiveCheckpoints);

    expect(manifest.entityCounts.raffles).toBe(expectedCounts.raffles);
    expect(manifest.entityCounts.tickets).toBe(expectedCounts.tickets);
    expect(manifest.entityCounts.users).toBe(expectedCounts.users);
    expect(manifest.entityCounts.raffleEvents).toBe(expectedCounts.raffleEvents);
    expect(manifest.entityCounts.deadLetterEvents).toBe(expectedCounts.deadLetterEvents);
    expect(manifest.entityCounts.platformStats).toBe(expectedCounts.platformStats);
    expect(manifest.entityCounts.webhooks).toBe(expectedCounts.webhooks);
    expect(manifest.entityCounts.archiveCheckpoints).toBe(expectedCounts.archiveCheckpoints);
    expect(manifest.entityCounts.hasCursor).toBe(true);
    expect(manifest.entityCounts.hasPlatformState).toBe(true);

    // Spot-checks
    const restoredUser = await userRepo.findOneBy({ address: seeded.user.address });
    expect(restoredUser).toBeDefined();
    expect(restoredUser?.totalTicketsBought).toBe(5);
    expect(restoredUser?.firstSeenLedger).toBe(1000);

    const restoredRaffle = await raffleRepo.findOneBy({ id: 1 });
    expect(restoredRaffle).toBeDefined();
    expect(restoredRaffle?.creator).toBe(seeded.user.address);
    expect(restoredRaffle?.ticketPrice).toBe("100");

    const restoredTicket = await ticketRepo.findOneBy({ id: 101 });
    expect(restoredTicket).toBeDefined();
    expect(restoredTicket?.raffleId).toBe(1);
    expect(restoredTicket?.purchaseTxHash).toBe("TX123");

    const restoredCursor = await cursorRepo.findOneBy({ id: 1 });
    expect(restoredCursor).toBeDefined();
    expect(restoredCursor?.lastLedger).toBe(1010);
    expect(restoredCursor?.lastPagingToken).toBe("token123");

    const restoredEvent = await raffleEventRepo.findOneBy({ txHash: "TX_EVENT_1" });
    expect(restoredEvent).toBeDefined();
    expect(restoredEvent?.eventType).toBe("RaffleCreated");
    expect(restoredEvent?.raffleId).toBe(1);

    const restoredDlq = await deadLetterRepo.find({ take: 1 });
    expect(restoredDlq[0]?.reason).toBe(DlqReason.PARSE_ERROR);
    expect(restoredDlq[0]?.errorMessage).toBe("parse failed");

    const restoredStat = await platformStatRepo.findOneBy({ date: "2026-07-27" });
    expect(restoredStat).toBeDefined();
    expect(restoredStat?.totalRaffles).toBe(1);
    expect(restoredStat?.totalVolumeXlm).toBe("100");

    const restoredState = await platformStateRepo.findOneBy({ id: "global" });
    expect(restoredState).toBeDefined();
    expect(restoredState?.paused).toBe(false);
    expect(restoredState?.adminAddress).toBe(seeded.user.address);

    const restoredWebhook = await webhookRepo.findOneBy({
      url: "https://hooks.example.com/tikka",
    });
    expect(restoredWebhook).toBeDefined();
    expect(restoredWebhook?.isActive).toBe(true);
    expect(restoredWebhook?.supportedEvents).toEqual(["RaffleCreated", "RaffleFinalized"]);

    const restoredCheckpoint = await archiveCheckpointRepo.find({ take: 1 });
    expect(restoredCheckpoint[0]?.jobType).toBe("raffle_events");
    expect(restoredCheckpoint[0]?.totalArchived).toBe(10);
    expect(restoredCheckpoint[0]?.status).toBe(ArchiveJobStatus.COMPLETED);
  });

  it("should fail import if checksum is invalid", async () => {
    await seedAllEntityTypes();
    const filename = await snapshotService.exportSnapshot();

    const key = `snapshots/${filename}`;
    const data = mockS3Store[key];
    data[data.length - 1] = data[data.length - 1] ^ 0xff;

    await expect(snapshotService.importSnapshot(filename)).rejects.toThrow();
  });

  it("should rollback transaction on failed import", async () => {
    await userRepo.save(
      userRepo.create({
        address: "GKEEPMEABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMN",
        totalTicketsBought: 0,
        firstSeenLedger: 1,
      }),
    );

    await seedAllEntityTypes();
    const filename = await snapshotService.exportSnapshot();

    const originalSave = ds.manager.save;
    jest.spyOn(ds.manager, "save").mockImplementationOnce(async (entity: any) => {
      if (entity === UserEntity || (Array.isArray(entity) && entity[0] instanceof UserEntity)) {
        throw new Error("DB Error during insert");
      }
      return originalSave.apply(ds.manager, [entity] as any);
    });

    try {
      await snapshotService.importSnapshot(filename);
    } catch {
      // Expected
    }

    const user = await userRepo.findOneBy({
      address: "GKEEPMEABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMN",
    });
    expect(user).toBeDefined();
  });
});

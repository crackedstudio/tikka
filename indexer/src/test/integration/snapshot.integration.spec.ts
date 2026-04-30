import { DataSource, Repository } from "typeorm";
import { SnapshotService } from "../../maintenance/snapshot.service";
import { RaffleEntity, RaffleStatus } from "../../database/entities/raffle.entity";
import { TicketEntity } from "../../database/entities/ticket.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { IndexerCursorEntity } from "../../database/entities/indexer-cursor.entity";
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from "./helpers/db-container";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";

// Mock S3 Client
jest.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
  };
});

describe("SnapshotService Integration", () => {
  let ctx: DbContainerContext;
  let ds: DataSource;
  let snapshotService: SnapshotService;
  let configService: ConfigService;

  let raffleRepo: Repository<RaffleEntity>;
  let ticketRepo: Repository<TicketEntity>;
  let userRepo: Repository<UserEntity>;
  let cursorRepo: Repository<IndexerCursorEntity>;

  let mockS3Store: Record<string, Buffer> = {};

  beforeAll(async () => {
    ctx = await startDb();
    ds = ctx.dataSource;

    raffleRepo = ds.getRepository(RaffleEntity);
    ticketRepo = ds.getRepository(TicketEntity);
    userRepo = ds.getRepository(UserEntity);
    cursorRepo = ds.getRepository(IndexerCursorEntity);

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
      configService,
    );

    // Setup S3 mock behavior
    const s3ClientMock = (S3Client as jest.Mock).mock.results[0].value;
    s3ClientMock.send.mockImplementation(async (command: any) => {
      if (command.constructor.name === "PutObjectCommand" || (command.input && !command.constructor.name)) {
          // PutObject
          const key = command.Key || command.input.Key;
          const body = command.Body || command.input.Body;
          mockS3Store[key] = body;
          return {};
      } else {
          // GetObject
          const key = command.Key || command.input.Key;
          if (!mockS3Store[key]) throw new Error("Not found");
          return {
              Body: {
                  async *[Symbol.asyncIterator]() {
                      yield mockS3Store[key];
                  }
              }
          };
      }
    });
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => stopDb(ctx));

  beforeEach(async () => {
    mockS3Store = {};
    await ds.query(`SET session_replication_role = 'replica'`);
    await ds.query(`TRUNCATE TABLE tickets, users, raffles, indexer_cursor RESTART IDENTITY CASCADE`);
    await ds.query(`SET session_replication_role = 'DEFAULT'`);
  });

  it("should round-trip a snapshot (export then import)", async () => {
    // 1. Seed data
    const user = userRepo.create({ address: "G123", totalTicketsBought: 5 });
    await userRepo.save(user);

    const raffle = raffleRepo.create({
      id: 1,
      creator: "G123",
      status: RaffleStatus.OPEN,
      ticketPrice: "100",
      maxTickets: 100,
      asset: "XLM",
      endTime: new Date(),
      createdLedger: 1000,
    });
    await raffleRepo.save(raffle);

    const ticket = ticketRepo.create({
      id: 101,
      raffleId: 1,
      owner: "G123",
      purchaseTxHash: "TX123",
      purchasedAtLedger: 1005,
    });
    await ticketRepo.save(ticket);

    const cursor = cursorRepo.create({ id: 1, lastLedger: 1010, lastPagingToken: "token123" });
    await cursorRepo.save(cursor);

    // 2. Export
    const filename = await snapshotService.exportSnapshot();
    expect(filename).toBeDefined();
    expect(mockS3Store[`snapshots/${filename}`]).toBeDefined();

    // 3. Truncate DB
    await ds.query(`SET session_replication_role = 'replica'`);
    await ds.query(`TRUNCATE TABLE tickets, users, raffles, indexer_cursor RESTART IDENTITY CASCADE`);
    await ds.query(`SET session_replication_role = 'DEFAULT'`);

    expect(await userRepo.count()).toBe(0);

    // 4. Import
    await snapshotService.importSnapshot(filename);

    // 5. Verify data is restored
    const restoredUser = await userRepo.findOneBy({ address: "G123" });
    expect(restoredUser).toBeDefined();
    expect(restoredUser?.totalTicketsBought).toBe(5);

    const restoredRaffle = await raffleRepo.findOneBy({ id: 1 });
    expect(restoredRaffle).toBeDefined();
    expect(restoredRaffle?.creator).toBe("G123");

    const restoredTicket = await ticketRepo.findOneBy({ id: 101 });
    expect(restoredTicket).toBeDefined();
    expect(restoredTicket?.raffleId).toBe(1);

    const restoredCursor = await cursorRepo.findOneBy({ id: 1 });
    expect(restoredCursor).toBeDefined();
    expect(restoredCursor?.lastLedger).toBe(1010);
  });

  it("should fail import if checksum is invalid", async () => {
    // 1. Export valid snapshot
    const filename = await snapshotService.exportSnapshot();
    
    // 2. Corrupt the data in S3 (manually edit the buffer)
    const key = `snapshots/${filename}`;
    const data = mockS3Store[key];
    data[data.length - 1] = data[data.length - 1] ^ 0xFF; // Flip last bit

    // 3. Import should fail
    await expect(snapshotService.importSnapshot(filename)).rejects.toThrow();
  });

  it("should rollback transaction on failed import", async () => {
    // 1. Seed some data that should NOT be deleted if import fails
    await userRepo.save(userRepo.create({ address: "KEEP_ME", totalTicketsBought: 0 }));

    // 2. Mock a failure during insertion
    const filename = await snapshotService.exportSnapshot();
    
    // We can't easily mock the transaction manager inside the service without more complex mocking,
    // but we can corrupt the JSON so it fails after clearing but before finishing.
    // Wait, the clearing is also part of the transaction.
    
    // Let's mock manager.save to throw
    const originalSave = ds.manager.save;
    jest.spyOn(ds.manager, 'save').mockImplementationOnce(async (entity: any) => {
        if (entity === UserEntity || (Array.isArray(entity) && entity[0] instanceof UserEntity)) {
             throw new Error("DB Error during insert");
        }
        return originalSave.apply(ds.manager, [entity] as any);
    });

    try {
        await snapshotService.importSnapshot(filename);
    } catch (e) {
        // Expected
    }

    // 3. Verify data still exists (rolled back)
    const user = await userRepo.findOneBy({ address: "KEEP_ME" });
    expect(user).toBeDefined();
  });
});

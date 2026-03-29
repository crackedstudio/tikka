import { archiveOldRaffleEvents } from "./archive-raffle-events";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

type MockRepo = {
  find: jest.Mock<Promise<RaffleEventEntity[]>, any>;
  delete: jest.Mock<Promise<void>, any>;
};

function makeEvent(id: string, daysOld: number): RaffleEventEntity {
  const e = new RaffleEventEntity();
  e.id = id;
  e.raffleId = 1;
  e.eventType = "RaffleCreated";
  e.ledger = 100;
  e.txHash = `tx-${id}`;
  e.payloadJson = { price: 10, max_tickets: 100 };
  e.indexedAt = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return e;
}

describe("archiveOldRaffleEvents", () => {
  it("writes CSV and deletes rows when not dryRun", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    const old1 = makeEvent("a1", 40);
    const old2 = makeEvent("a2", 31);
    const recent = makeEvent("r1", 5);

    const repo: MockRepo = {
      find: jest.fn().mockResolvedValue([old1, old2, recent]),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;

    const result = await archiveOldRaffleEvents(repo as any, {
      retentionDays: 30,
      batchSize: 10,
      dryRun: false,
      outDir: tmp,
    });

    expect(result.totalArchived).toBeGreaterThanOrEqual(2);
    expect(repo.delete).toHaveBeenCalled();

    // Verify a CSV file was created
    const files = fs.readdirSync(tmp).filter((f) => f.endsWith(".csv"));
    expect(files.length).toBeGreaterThan(0);

    // Cleanup
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not delete when dryRun is true", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    const old1 = makeEvent("b1", 60);

    const repo: MockRepo = {
      find: jest.fn().mockResolvedValue([old1]),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;

    const result = await archiveOldRaffleEvents(repo as any, {
      retentionDays: 30,
      batchSize: 10,
      dryRun: true,
      outDir: tmp,
    });

    expect(result.totalArchived).toBeGreaterThanOrEqual(1);
    expect(repo.delete).not.toHaveBeenCalled();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

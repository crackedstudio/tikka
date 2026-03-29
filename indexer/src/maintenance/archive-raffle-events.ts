import { AppDataSource } from "../data-source";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import { In, Repository } from "typeorm";
import * as fs from "fs";
import * as path from "path";

export interface ArchiveOptions {
  retentionDays?: number;
  batchSize?: number;
  dryRun?: boolean;
  outDir?: string;
}

/**
 * Archive old raffle_events to local CSV and delete them safely in batches.
 * This function is written for easy unit testing by accepting a repository.
 */
export async function archiveOldRaffleEvents(
  repo: Repository<RaffleEventEntity>,
  opts: ArchiveOptions = {},
) {
  const retentionDays = opts.retentionDays ?? 30;
  const batchSize = opts.batchSize ?? 500;
  const dryRun = opts.dryRun ?? true;
  const outDir = opts.outDir ?? path.join(process.cwd(), "archives");

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let batch = 0;
  let totalArchived = 0;

  while (true) {
    const rows = await repo.find({
      where: { indexedAt: ("<" as any) /* placeholder, handled below */ },
      take: batchSize,
      order: { indexedAt: "ASC" as any },
    } as any);

    // Filter rows by cutoff (since TypeORM where placeholder above is not used)
    const oldRows = rows.filter((r) => r.indexedAt < cutoff);
    if (oldRows.length === 0) break;

    batch += 1;
    const filename = path.join(
      outDir,
      `raffle_events_${cutoff.toISOString().slice(0, 10)}_part${batch}.csv`,
    );

    const header = [
      "id",
      "raffle_id",
      "event_type",
      "ledger",
      "tx_hash",
      "payload_json",
      "indexed_at",
    ];

    const stream = fs.createWriteStream(filename, { encoding: "utf8" });
    stream.write(header.join(",") + "\n");

    for (const row of oldRows) {
      const line = [
        row.id,
        String(row.raffleId),
        row.eventType,
        String(row.ledger),
        row.txHash,
        JSON.stringify(row.payloadJson).replace(/\n/g, " ").replace(/\r/g, " "),
        row.indexedAt.toISOString(),
      ]
        .map((v) => {
          if (typeof v === "string" && v.includes(",")) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(",");
      stream.write(line + "\n");
    }

    stream.end();
    await new Promise<void>((res) => stream.on("finish", () => res()));

    totalArchived += oldRows.length;

    if (!dryRun) {
      const ids = oldRows.map((r) => r.id);
      // Delete in a batch
      await repo.delete({ id: In(ids) } as any);
    }

    // If fewer than batchSize rows were returned, we're done
    if (oldRows.length < batchSize) break;
  }

  return { totalArchived };
}

// CLI entrypoint
if (require.main === module) {
  (async () => {
    const retentionDays = parseInt(process.env.RAFFLE_EVENTS_RETENTION_DAYS ?? "30", 10);
    const dryRun = process.env.DRY_RUN !== "false"; // default true

    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(RaffleEventEntity);

    console.log(`Starting archival: retentionDays=${retentionDays}, dryRun=${dryRun}`);
    const result = await archiveOldRaffleEvents(repo, {
      retentionDays,
      dryRun,
      batchSize: 500,
    });
    console.log(`Archived approx ${result.totalArchived} rows (dryRun=${dryRun})`);
    await AppDataSource.destroy();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

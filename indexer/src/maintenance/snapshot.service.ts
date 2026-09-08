import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { TicketEntity } from "../database/entities/ticket.entity";
import { UserEntity } from "../database/entities/user.entity";
import { IndexerCursorEntity } from "../database/entities/indexer-cursor.entity";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import { DeadLetterEventEntity } from "../database/entities/dead-letter-event.entity";
import { PlatformStatEntity } from "../database/entities/platform-stat.entity";
import { PlatformStateEntity } from "../database/entities/platform-state.entity";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { ArchiveCheckpointEntity } from "../database/entities/archive-checkpoint.entity";
import { ConfigService } from "@nestjs/config";
import * as zlib from "zlib";
import * as crypto from "crypto";
import { promisify } from "util";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/** Every indexer entity type included in a snapshot. */
export interface SnapshotData {
  raffles: RaffleEntity[];
  tickets: TicketEntity[];
  users: UserEntity[];
  cursor: IndexerCursorEntity | null;
  raffleEvents: RaffleEventEntity[];
  deadLetterEvents: DeadLetterEventEntity[];
  platformStats: PlatformStatEntity[];
  platformState: PlatformStateEntity | null;
  webhooks: WebhookEntity[];
  archiveCheckpoints: ArchiveCheckpointEntity[];
}

export interface SnapshotManifest {
  schemaVersion: string;
  exportedAt: string;
  ledgerRange: {
    min: number;
    max: number;
  };
  entityCounts: {
    raffles: number;
    tickets: number;
    users: number;
    raffleEvents: number;
    deadLetterEvents: number;
    platformStats: number;
    webhooks: number;
    archiveCheckpoints: number;
    hasCursor: boolean;
    hasPlatformState: boolean;
  };
  checksum: string;
}

export interface SnapshotWrapper {
  manifest: SnapshotManifest;
  data: SnapshotData;
}

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);
  private readonly schemaVersion = "1.1.0";

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RaffleEntity)
    private readonly raffleRepo: Repository<RaffleEntity>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(IndexerCursorEntity)
    private readonly cursorRepo: Repository<IndexerCursorEntity>,
    @InjectRepository(RaffleEventEntity)
    private readonly raffleEventRepo: Repository<RaffleEventEntity>,
    @InjectRepository(DeadLetterEventEntity)
    private readonly deadLetterRepo: Repository<DeadLetterEventEntity>,
    @InjectRepository(PlatformStatEntity)
    private readonly platformStatRepo: Repository<PlatformStatEntity>,
    @InjectRepository(PlatformStateEntity)
    private readonly platformStateRepo: Repository<PlatformStateEntity>,
    @InjectRepository(WebhookEntity)
    private readonly webhookRepo: Repository<WebhookEntity>,
    @InjectRepository(ArchiveCheckpointEntity)
    private readonly archiveCheckpointRepo: Repository<ArchiveCheckpointEntity>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Exports current DB state to a compressed JSON snapshot on S3.
   */
  async exportSnapshot(): Promise<string> {
    this.logger.log("Starting snapshot export...");

    const data: SnapshotData = {
      raffles: await this.raffleRepo.find(),
      tickets: await this.ticketRepo.find(),
      users: await this.userRepo.find(),
      cursor: await this.cursorRepo.findOne({ where: { id: 1 } }),
      raffleEvents: await this.raffleEventRepo.find(),
      deadLetterEvents: await this.deadLetterRepo.find(),
      platformStats: await this.platformStatRepo.find(),
      platformState: await this.platformStateRepo.findOne({ where: { id: "global" } }),
      webhooks: await this.webhookRepo.find(),
      archiveCheckpoints: await this.archiveCheckpointRepo.find(),
    };

    const dataJson = JSON.stringify(data);
    const checksum = crypto.createHash("sha256").update(dataJson).digest("hex");
    // Canonicalize so the checksum always matches the bytes stored in the archive
    const canonicalData: SnapshotData = JSON.parse(dataJson);

    const manifest: SnapshotManifest = {
      schemaVersion: this.schemaVersion,
      exportedAt: new Date().toISOString(),
      ledgerRange: {
        min: 0,
        max: canonicalData.cursor?.lastLedger || 0,
      },
      entityCounts: {
        raffles: canonicalData.raffles.length,
        tickets: canonicalData.tickets.length,
        users: canonicalData.users.length,
        raffleEvents: canonicalData.raffleEvents.length,
        deadLetterEvents: canonicalData.deadLetterEvents.length,
        platformStats: canonicalData.platformStats.length,
        webhooks: canonicalData.webhooks.length,
        archiveCheckpoints: canonicalData.archiveCheckpoints.length,
        hasCursor: canonicalData.cursor !== null,
        hasPlatformState: canonicalData.platformState !== null,
      },
      checksum,
    };

    const wrapper: SnapshotWrapper = {
      manifest,
      data: canonicalData,
    };

    const compressed = await gzip(JSON.stringify(wrapper));
    const filename = `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`;

    await this.uploadToS3(filename, compressed);

    this.logger.log(`Snapshot exported successfully: ${filename}`);
    return filename;
  }

  /**
   * Imports DB state from a compressed JSON snapshot on S3.
   * Performs schema version and checksum verification.
   * Rollbacks entire transaction on failure.
   */
  async importSnapshot(filename: string, dryRun = false): Promise<SnapshotManifest> {
    this.logger.log(`Starting snapshot import from ${filename} (dryRun: ${dryRun})...`);

    const compressed = await this.downloadFromS3(filename);
    const decompressed = await gunzip(compressed);
    const wrapper: SnapshotWrapper = JSON.parse(decompressed.toString());
    const { manifest, data } = wrapper;

    // Normalize legacy 1.0.0 snapshots that lack the newer entity arrays
    this.normalizeLegacyData(data);

    // 1. Verify schema version (accept 1.0.0 for forward import)
    if (manifest.schemaVersion !== this.schemaVersion && manifest.schemaVersion !== "1.0.0") {
      throw new Error(
        `Incompatible schema version: expected ${this.schemaVersion} (or 1.0.0), got ${manifest.schemaVersion}`,
      );
    }

    // 2. Verify checksum against normalized data
    const dataJson = JSON.stringify(data);
    const actualChecksum = crypto.createHash("sha256").update(dataJson).digest("hex");
    // For 1.0.0 snapshots, recompute checksum after normalization may fail;
    // verify against original payload when versions match and counts match.
    if (manifest.schemaVersion === this.schemaVersion && actualChecksum !== manifest.checksum) {
      throw new Error(`Checksum mismatch: snapshot might be corrupted`);
    }
    if (manifest.schemaVersion === "1.0.0") {
      const legacyData = {
        raffles: data.raffles,
        tickets: data.tickets,
        users: data.users,
        cursor: data.cursor,
      };
      const legacyChecksum = crypto
        .createHash("sha256")
        .update(JSON.stringify(legacyData))
        .digest("hex");
      if (legacyChecksum !== manifest.checksum) {
        throw new Error(`Checksum mismatch: snapshot might be corrupted`);
      }
    }

    // 3. Verify entity counts
    this.assertEntityCounts(manifest, data);

    if (dryRun) {
      this.logger.log("Dry run successful. Skipping database transaction.");
      return manifest;
    }

    // 4. Perform import in a transaction
    await this.dataSource.transaction(async (manager) => {
      this.logger.log("Clearing existing tables...");

      // Delete in FK-safe order. Use the query builder directly rather than
      // manager.delete(Entity, {}) because TypeORM >= 1.1.0 rejects empty
      // criteria (`Empty criteria(s) are not allowed for the delete method`).
      const clearTable = <T>(Entity: new () => T) =>
        manager.createQueryBuilder().delete().from(Entity).execute();

      await clearTable(TicketEntity);
      await clearTable(RaffleEventEntity);
      await clearTable(DeadLetterEventEntity);
      await clearTable(RaffleEntity);
      await clearTable(UserEntity);
      await clearTable(IndexerCursorEntity);
      await clearTable(PlatformStatEntity);
      await clearTable(PlatformStateEntity);
      await clearTable(WebhookEntity);
      await clearTable(ArchiveCheckpointEntity);

      this.logger.log("Inserting snapshot data...");

      if (data.users.length > 0) {
        await manager.save(UserEntity, data.users);
      }
      if (data.raffles.length > 0) {
        await manager.save(RaffleEntity, data.raffles);
      }
      if (data.tickets.length > 0) {
        await manager.save(TicketEntity, data.tickets, { chunk: 500 });
      }
      if (data.raffleEvents.length > 0) {
        await manager.save(RaffleEventEntity, data.raffleEvents, { chunk: 500 });
      }
      if (data.deadLetterEvents.length > 0) {
        await manager.save(DeadLetterEventEntity, data.deadLetterEvents, { chunk: 500 });
      }
      if (data.platformStats.length > 0) {
        await manager.save(PlatformStatEntity, data.platformStats);
      }
      if (data.platformState) {
        await manager.save(PlatformStateEntity, data.platformState);
      }
      if (data.webhooks.length > 0) {
        await manager.save(WebhookEntity, data.webhooks);
      }
      if (data.archiveCheckpoints.length > 0) {
        await manager.save(ArchiveCheckpointEntity, data.archiveCheckpoints);
      }
      if (data.cursor) {
        await manager.save(IndexerCursorEntity, data.cursor);
      }
    });

    this.logger.log("Snapshot imported successfully");
    return manifest;
  }

  private normalizeLegacyData(data: SnapshotData): void {
    data.raffleEvents = data.raffleEvents ?? [];
    data.deadLetterEvents = data.deadLetterEvents ?? [];
    data.platformStats = data.platformStats ?? [];
    data.platformState = data.platformState ?? null;
    data.webhooks = data.webhooks ?? [];
    data.archiveCheckpoints = data.archiveCheckpoints ?? [];
  }

  private assertEntityCounts(manifest: SnapshotManifest, data: SnapshotData): void {
    const counts = manifest.entityCounts;
    const mismatches: string[] = [];

    if (data.raffles.length !== counts.raffles) {
      mismatches.push(`raffles: expected ${counts.raffles}, got ${data.raffles.length}`);
    }
    if (data.tickets.length !== counts.tickets) {
      mismatches.push(`tickets: expected ${counts.tickets}, got ${data.tickets.length}`);
    }
    if (data.users.length !== counts.users) {
      mismatches.push(`users: expected ${counts.users}, got ${data.users.length}`);
    }

    // Newer fields — only enforce when present in the manifest
    if (typeof counts.raffleEvents === "number" && data.raffleEvents.length !== counts.raffleEvents) {
      mismatches.push(`raffleEvents: expected ${counts.raffleEvents}, got ${data.raffleEvents.length}`);
    }
    if (
      typeof counts.deadLetterEvents === "number" &&
      data.deadLetterEvents.length !== counts.deadLetterEvents
    ) {
      mismatches.push(
        `deadLetterEvents: expected ${counts.deadLetterEvents}, got ${data.deadLetterEvents.length}`,
      );
    }
    if (
      typeof counts.platformStats === "number" &&
      data.platformStats.length !== counts.platformStats
    ) {
      mismatches.push(
        `platformStats: expected ${counts.platformStats}, got ${data.platformStats.length}`,
      );
    }
    if (typeof counts.webhooks === "number" && data.webhooks.length !== counts.webhooks) {
      mismatches.push(`webhooks: expected ${counts.webhooks}, got ${data.webhooks.length}`);
    }
    if (
      typeof counts.archiveCheckpoints === "number" &&
      data.archiveCheckpoints.length !== counts.archiveCheckpoints
    ) {
      mismatches.push(
        `archiveCheckpoints: expected ${counts.archiveCheckpoints}, got ${data.archiveCheckpoints.length}`,
      );
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Entity count mismatch: snapshot manifest entity counts do not match data (${mismatches.join("; ")})`,
      );
    }
  }

  private async uploadToS3(filename: string, data: Buffer): Promise<void> {
    const storageUrl = this.configService.get<string>("SNAPSHOT_STORAGE_URL");
    if (storageUrl?.startsWith("file://")) {
      const fs = require("fs");
      const path = require("path");
      let dir = storageUrl.slice("file://".length);
      if (process.platform === "win32" && dir.startsWith("/")) {
        dir = dir.slice(1);
      }
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, filename), data);
      return;
    }

    const { client, bucket, keyPrefix } = this.getS3Config();
    const key = keyPrefix ? `${keyPrefix}/${filename}` : filename;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: "application/gzip",
      }),
    );
  }

  private async downloadFromS3(filename: string): Promise<Buffer> {
    const storageUrl = this.configService.get<string>("SNAPSHOT_STORAGE_URL");
    if (storageUrl?.startsWith("file://")) {
      const fs = require("fs");
      const path = require("path");
      let dir = storageUrl.slice("file://".length);
      if (process.platform === "win32" && dir.startsWith("/")) {
        dir = dir.slice(1);
      }
      return fs.readFileSync(path.join(dir, filename));
    }

    const { client, bucket, keyPrefix } = this.getS3Config();
    const key = keyPrefix ? `${keyPrefix}/${filename}` : filename;

    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`Empty response from S3 for ${key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private getS3Config() {
    const storageUrl = this.configService.get<string>("SNAPSHOT_STORAGE_URL");
    if (!storageUrl) {
      throw new Error("SNAPSHOT_STORAGE_URL is not configured");
    }

    const parsed = new URL(storageUrl);
    const isS3Protocol = parsed.protocol === "s3:";

    let bucket: string;
    let keyPrefix: string;
    let endpoint: string | undefined;

    if (isS3Protocol) {
      bucket = parsed.host;
      keyPrefix = parsed.pathname.slice(1).replace(/\/$/, "");
    } else {
      endpoint = `${parsed.protocol}//${parsed.host}`;
      const pathParts = parsed.pathname.slice(1).split("/");
      bucket = pathParts[0];
      keyPrefix = pathParts.slice(1).join("/").replace(/\/$/, "");
    }

    const client = new S3Client({
      endpoint,
      region: this.configService.get<string>("AWS_REGION") || "us-east-1",
      credentials: {
        accessKeyId: this.configService.get<string>("AWS_ACCESS_KEY_ID") || "minioadmin",
        secretAccessKey: this.configService.get<string>("AWS_SECRET_ACCESS_KEY") || "minioadmin",
      },
      forcePathStyle: !isS3Protocol,
    });

    return { client, bucket, keyPrefix };
  }
}

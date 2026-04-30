import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { TicketEntity } from "../database/entities/ticket.entity";
import { UserEntity } from "../database/entities/user.entity";
import { IndexerCursorEntity } from "../database/entities/indexer-cursor.entity";
import { ConfigService } from "@nestjs/config";
import * as zlib from "zlib";
import * as crypto from "crypto";
import { promisify } from "util";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface SnapshotData {
  raffles: RaffleEntity[];
  tickets: TicketEntity[];
  users: UserEntity[];
  cursor: IndexerCursorEntity | null;
}

export interface SnapshotWrapper {
  schemaVersion: string;
  timestamp: string;
  checksum: string;
  data: SnapshotData;
}

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);
  private readonly schemaVersion = "1.0.0";

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
    };

    const dataJson = JSON.stringify(data);
    const checksum = crypto.createHash("sha256").update(dataJson).digest("hex");

    const wrapper: SnapshotWrapper = {
      schemaVersion: this.schemaVersion,
      timestamp: new Date().toISOString(),
      checksum,
      data,
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
  async importSnapshot(filename: string): Promise<void> {
    this.logger.log(`Starting snapshot import from ${filename}...`);

    const compressed = await this.downloadFromS3(filename);
    const decompressed = await gunzip(compressed);
    const wrapper: SnapshotWrapper = JSON.parse(decompressed.toString());

    // 1. Verify schema version
    if (wrapper.schemaVersion !== this.schemaVersion) {
      throw new Error(
        `Incompatible schema version: expected ${this.schemaVersion}, got ${wrapper.schemaVersion}`,
      );
    }

    // 2. Verify checksum
    const dataJson = JSON.stringify(wrapper.data);
    const actualChecksum = crypto.createHash("sha256").update(dataJson).digest("hex");
    if (actualChecksum !== wrapper.checksum) {
      throw new Error(`Checksum mismatch: snapshot might be corrupted`);
    }

    // 3. Perform import in a transaction
    await this.dataSource.transaction(async (manager) => {
      this.logger.log("Clearing existing tables...");
      
      // Delete in correct order to respect FKs (though CASCADE should handle it, explicit is safer)
      // Order: tickets -> raffles -> users -> cursor
      await manager.delete(TicketEntity, {});
      await manager.delete(RaffleEntity, {});
      await manager.delete(UserEntity, {});
      await manager.delete(IndexerCursorEntity, {});

      this.logger.log("Inserting snapshot data...");
      
      if (wrapper.data.users.length > 0) {
        await manager.save(UserEntity, wrapper.data.users);
      }
      if (wrapper.data.raffles.length > 0) {
        await manager.save(RaffleEntity, wrapper.data.raffles);
      }
      if (wrapper.data.tickets.length > 0) {
        // Bulk insert tickets might be large, use chunks if necessary
        await manager.save(TicketEntity, wrapper.data.tickets, { chunk: 500 });
      }
      if (wrapper.data.cursor) {
        await manager.save(IndexerCursorEntity, wrapper.data.cursor);
      }
    });

    this.logger.log("Snapshot imported successfully");
  }

  private async uploadToS3(filename: string, data: Buffer): Promise<void> {
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
    // Support s3://bucket/prefix or https://endpoint/bucket/prefix
    const isS3Protocol = parsed.protocol === "s3:";
    
    let bucket: string;
    let keyPrefix: string;
    let endpoint: string | undefined;

    if (isS3Protocol) {
      bucket = parsed.host;
      keyPrefix = parsed.pathname.slice(1).replace(/\/$/, "");
    } else {
      // Assume https://endpoint/bucket/prefix
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
      forcePathStyle: !isS3Protocol, // Needed for Minio/localstack
    });

    return { client, bucket, keyPrefix };
  }
}

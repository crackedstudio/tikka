import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter } from "events";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { CacheService } from "../cache/cache.service";
import { CursorManagerService } from "../ingestor/cursor-manager.service";
import { DlqService } from "../ingestor/dlq.service";
import {
  PipelineStateMachine,
  PipelineStateSnapshot,
} from '../ingestor/pipeline-state';
import {
  ArchiveIntegrityStatusService,
  ArchiveIntegrityStatusSnapshot,
} from './archive-integrity-status.service';

export const LAG_THRESHOLD_DEFAULT = 100;
export const LAG_ALERT_THRESHOLD_DEFAULT = 50;
export const DLQ_PRESSURE_THRESHOLD_DEFAULT = 100;

export interface HealthResult {
  status: "ok" | "degraded";
  lag_ledgers: number | null;
  lagStatus: "healthy" | "degraded" | "critical";
  db: "ok" | "error";
  redis: "ok" | "error";
  redis_latency_ms: number | null;
  cursor: "ok" | "error";
  cursor_integrity: "ok" | "error";
  dlq_size: number;
  dlqPressure: "ok" | "high";
  pipeline?: PipelineStateSnapshot | null;
  archive_integrity?: ArchiveIntegrityStatusSnapshot;
}

@Injectable()
export class HealthService {
  private readonly horizonUrl: string;
  private readonly lagThreshold: number;
  private readonly lagAlertThreshold: number;
  private readonly dlqPressureThreshold: number;
  private previousLagStatus: "healthy" | "degraded" | "critical" = "healthy";
  private eventEmitter: EventEmitter;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly cursorManagerService: CursorManagerService,
    @Optional() private readonly dlqService?: DlqService,
    @Optional() private readonly pipeline?: PipelineStateMachine,
    @Optional()
    private readonly archiveIntegrityStatusService?: ArchiveIntegrityStatusService,
  ) {
    this.horizonUrl = this.configService
      .get<string>("HORIZON_URL", "https://horizon.stellar.org")
      .replace(/\/$/, "");
    this.lagThreshold = this.configService.get<number>(
      "LAG_THRESHOLD",
      LAG_THRESHOLD_DEFAULT,
    );
    this.lagAlertThreshold = this.configService.get<number>(
      "INDEXER_LAG_ALERT_THRESHOLD_LEDGERS",
      LAG_ALERT_THRESHOLD_DEFAULT,
    );
    this.dlqPressureThreshold = this.configService.get<number>(
      "DLQ_PRESSURE_THRESHOLD",
      DLQ_PRESSURE_THRESHOLD_DEFAULT,
    );
    this.eventEmitter = new EventEmitter();
  }

  async getHealth(): Promise<HealthResult> {
    const [dbOk, redisLatency, latestLedger, cursor, dlq_size, archiveIntegrity] =
      await Promise.all([
        this.checkDb(),
        this.cacheService.latency(),
        this.fetchLatestLedger(),
        this.cursorManagerService.getCursor(),
        this.dlqService ? this.dlqService.count() : Promise.resolve(0),
        this.archiveIntegrityStatusService
          ? this.archiveIntegrityStatusService.getStatus()
          : Promise.resolve(undefined),
      ]);

    const db: "ok" | "error" = dbOk ? "ok" : "error";
    const redis: "ok" | "error" = redisLatency !== null ? "ok" : "error";
    const cursorSanity = this.checkCursorSanity(cursor);
    const cursor_status: "ok" | "error" = cursorSanity.ok ? "ok" : "error";
    const cursor_integrity: "ok" | "error" =
      this.cursorManagerService.getStatus().startupIntegrityPassed
        ? "ok"
        : "error";
    const dlqPressure: "ok" | "high" =
      dlq_size > this.dlqPressureThreshold ? "high" : "ok";

    let lag_ledgers: number | null = null;
    if (latestLedger != null && cursor != null && cursor.lastLedger > 0) {
      lag_ledgers = Math.max(0, latestLedger - cursor.lastLedger);
    }

    let lagStatus: "healthy" | "degraded" | "critical" = "healthy";
    if (lag_ledgers !== null) {
      if (lag_ledgers > this.lagAlertThreshold) {
        lagStatus = "critical";
      } else if (lag_ledgers > this.lagThreshold) {
        lagStatus = "degraded";
      }
    }

    if (lagStatus === "critical" && this.previousLagStatus !== "critical") {
      this.eventEmitter.emit("indexer_lag_alert", {
        lag_ledgers,
        threshold: this.lagAlertThreshold,
        timestamp: new Date().toISOString(),
      });
    }
    this.previousLagStatus = lagStatus;

    const degradedByLag =
      lag_ledgers != null && lag_ledgers > this.lagThreshold;
    const degradedByDlq = dlqPressure === "high";
    const degradedByCursorIntegrity = cursor_integrity === "error";
    const degradedByArchiveIntegrity =
      archiveIntegrity?.archive_integrity === "failed";
    const status: "ok" | "degraded" =
      db === "error" ||
      redis === "error" ||
      cursor_status === "error" ||
      degradedByCursorIntegrity ||
      degradedByLag ||
      degradedByDlq ||
      degradedByArchiveIntegrity
        ? "degraded"
        : "ok";

    const pipeline = this.pipeline ? this.pipeline.snapshot() : null;

    return {
      status,
      lag_ledgers,
      lagStatus,
      db,
      redis,
      redis_latency_ms: redisLatency,
      cursor: cursor_status,
      cursor_integrity,
      dlq_size,
      dlqPressure,
      pipeline,
      archive_integrity: archiveIntegrity,
    };
  }

  getPipelineState(): PipelineStateSnapshot | null {
    return this.pipeline ? this.pipeline.snapshot() : null;
  }

  private async checkDb(): Promise<boolean> {
    try {
      if (!this.dataSource.isInitialized) return false;
      await this.dataSource.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  private checkCursorSanity(cursor: any): { ok: boolean; reason?: string } {
    if (!cursor) {
      return { ok: false, reason: "Cursor not initialized" };
    }

    if (!Number.isInteger(cursor.lastLedger) || cursor.lastLedger <= 0) {
      return { ok: false, reason: `Invalid lastLedger: ${cursor.lastLedger}` };
    }

    if (cursor.lastLedger > 1_000_000_000) {
      return {
        ok: false,
        reason: `Cursor ledger impossibly large: ${cursor.lastLedger}`,
      };
    }

    return { ok: true };
  }

  private async fetchLatestLedger(): Promise<number | null> {
    try {
      const res = await fetch(`${this.horizonUrl}/ledgers?order=desc&limit=1`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        _embedded?: { records?: Array<{ sequence: string }> };
      };
      const seq = json._embedded?.records?.[0]?.sequence;
      return seq != null ? parseInt(seq, 10) : null;
    } catch {
      return null;
    }
  }

  getLagThreshold(): number {
    return this.lagThreshold;
  }

  getLagAlertThreshold(): number {
    return this.lagAlertThreshold;
  }

  getDlqPressureThreshold(): number {
    return this.dlqPressureThreshold;
  }

  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}

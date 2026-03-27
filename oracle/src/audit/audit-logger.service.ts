import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface AuditLogEntry {
  timestamp: string;
  raffle_id: number;
  request_id: string;
  oracle_id: string;
  seed: string;
  proof: string;
  tx_hash: string;
  method: 'VRF' | 'PRNG';
  custom_seed: string | null;
}

/**
 * AuditLoggerService — persists every reveal result off-chain for transparency.
 *
 * Writes to a newline-delimited JSON (NDJSON) log file under the configured
 * AUDIT_LOG_DIR (default: ./logs/audit).  Entries older than AUDIT_LOG_RETENTION_DAYS
 * (default: 365) are pruned on startup and daily thereafter.
 *
 * The log is also exposed via the backend's /transparency endpoint so users
 * can independently verify on-chain randomness.
 */
@Injectable()
export class AuditLoggerService implements OnModuleInit {
  private readonly logger = new Logger(AuditLoggerService.name);
  private readonly logDir: string;
  private readonly retentionDays: number;
  private readonly oracleId: string;

  constructor(private readonly configService: ConfigService) {
    this.logDir = this.configService.get<string>('AUDIT_LOG_DIR', './logs/audit');
    this.retentionDays = this.configService.get<number>('AUDIT_LOG_RETENTION_DAYS', 365);
    this.oracleId = this.configService.get<string>('ORACLE_ID', 'oracle-1');
  }

  onModuleInit() {
    fs.mkdirSync(this.logDir, { recursive: true });
    this.pruneOldLogs();
    // Prune daily
    setInterval(() => this.pruneOldLogs(), 24 * 60 * 60 * 1000);
  }

  /**
   * Appends a reveal result to today's audit log file.
   */
  async log(entry: Omit<AuditLogEntry, 'timestamp' | 'oracle_id'>): Promise<void> {
    const record: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      oracle_id: this.oracleId,
      ...entry,
    };

    const filePath = this.todayLogPath();
    const line = JSON.stringify(record) + '\n';

    try {
      fs.appendFileSync(filePath, line, 'utf8');
      this.logger.debug(`Audit logged raffle=${record.raffle_id} request=${record.request_id} tx=${record.tx_hash}`);
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err.message}`);
    }
  }

  /**
   * Reads all entries within the retention window, newest first.
   * Optionally filter by raffle_id.
   */
  readEntries(raffleId?: number): AuditLogEntry[] {
    const files = this.logFilesInWindow();
    const entries: AuditLogEntry[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const entry: AuditLogEntry = JSON.parse(line);
            if (raffleId === undefined || entry.raffle_id === raffleId) {
              entries.push(entry);
            }
          } catch {
            // skip malformed lines
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private todayLogPath(): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(this.logDir, `audit-${date}.ndjson`);
  }

  private logFilesInWindow(): string[] {
    try {
      const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
      return fs
        .readdirSync(this.logDir)
        .filter((f: string) => f.startsWith('audit-') && f.endsWith('.ndjson'))
        .filter((f: string) => {
          const dateStr = f.replace('audit-', '').replace('.ndjson', '');
          return new Date(dateStr).getTime() >= cutoff;
        })
        .map((f: string) => path.join(this.logDir, f));
    } catch {
      return [];
    }
  }

  private pruneOldLogs(): void {
    try {
      const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(this.logDir).filter((f: string) => f.startsWith('audit-') && f.endsWith('.ndjson'));
      for (const f of files) {
        const dateStr = f.replace('audit-', '').replace('.ndjson', '');
        if (new Date(dateStr).getTime() < cutoff) {
          fs.unlinkSync(path.join(this.logDir, f));
          this.logger.log(`Pruned old audit log: ${f}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Audit log pruning failed: ${err.message}`);
    }
  }
}

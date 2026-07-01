import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HealthService } from './health.service';
import { ContractService } from '../contract/contract.service';
import { AlertingService } from './alerting.service';

const HEARTBEAT_ALERT_DEDUP_KEY = 'tikka-oracle-heartbeat-missed';

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  
  private intervalId: NodeJS.Timeout;
  private watchdogId: NodeJS.Timeout;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatAlertTimeoutMs: number;
  private lastHeartbeatAt: number | null = null;
  private heartbeatAlertFired = false;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly healthService: HealthService,
    private readonly contractService: ContractService,
    private readonly alertingService: AlertingService,
  ) {
    // Default to 1 hour (3600000 ms) if not configured
    this.heartbeatIntervalMs = process.env.HEARTBEAT_INTERVAL_MS 
      ? parseInt(process.env.HEARTBEAT_INTERVAL_MS, 10) 
      : 3600000;

    // Default to 90 000 ms if not configured
    this.heartbeatAlertTimeoutMs = process.env.HEARTBEAT_ALERT_TIMEOUT_MS
      ? parseInt(process.env.HEARTBEAT_ALERT_TIMEOUT_MS, 10)
      : 90000;
  }

  onModuleInit() {
    this.logger.log(`Starting Oracle Heartbeat Service with interval ${this.heartbeatIntervalMs}ms`);
    this.startHeartbeat();
    this.startWatchdog();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (this.watchdogId) {
      clearInterval(this.watchdogId);
    }
  }

  private startHeartbeat() {
    this.intervalId = setInterval(async () => {
      await this.emitHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Watchdog: checks every HEARTBEAT_ALERT_TIMEOUT_MS whether a heartbeat has
   * been sent recently.  Fires a critical alert if not; auto-resolves when the
   * heartbeat resumes.
   */
  private startWatchdog() {
    this.watchdogId = setInterval(async () => {
      await this.checkHeartbeatAlive();
    }, this.heartbeatAlertTimeoutMs);
  }

  private async checkHeartbeatAlive(): Promise<void> {
    const now = Date.now();
    const missedHeartbeat =
      this.lastHeartbeatAt === null ||
      now - this.lastHeartbeatAt > this.heartbeatAlertTimeoutMs;

    if (missedHeartbeat && !this.heartbeatAlertFired) {
      this.heartbeatAlertFired = true;
      const idleMs = this.lastHeartbeatAt === null ? null : now - this.lastHeartbeatAt;
      const details = idleMs === null
        ? 'No heartbeat has ever been sent since startup.'
        : `Last heartbeat was ${Math.round(idleMs / 1000)}s ago (threshold: ${this.heartbeatAlertTimeoutMs / 1000}s).`;

      this.logger.error(`Heartbeat alert: ${details}`);
      await this.alertingService.fire({
        severity: 'critical',
        summary: 'Tikka Oracle heartbeat missed',
        details,
        dedupKey: HEARTBEAT_ALERT_DEDUP_KEY,
      });
    } else if (!missedHeartbeat && this.heartbeatAlertFired) {
      this.heartbeatAlertFired = false;
      this.logger.log('Heartbeat resumed — resolving alert.');
      await this.alertingService.resolve(HEARTBEAT_ALERT_DEDUP_KEY);
    }
  }

  private async emitHeartbeat() {
    try {
      this.logger.debug('Executing heartbeat check...');
      
      const isHealthy = this.healthService.isHealthy();
      if (!isHealthy) {
        this.logger.warn('Oracle is not healthy. Skipping contract ping.');
        return;
      }

      await this.contractService.ping();
      this.lastHeartbeatAt = Date.now();
      this.logger.log('Oracle heartbeat emitted successfully: healthy');
      
    } catch (error) {
      this.logger.error(`Failed to emit oracle heartbeat: ${error.message}`, error.stack);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AlertingService } from './alerting.service';

export interface PendingRequest {
  requestId: string;
  raffleId: number;
  requestedAtLedger: number;
  timestamp: Date;
}

@Injectable()
export class LagMonitorService {
  private readonly logger = new Logger(LagMonitorService.name);
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly LAG_THRESHOLD_LEDGERS = 100;
  private currentLedger = 0;
  /** Tracks which requestIds have already had a lag alert fired. */
  private readonly firedAlerts = new Set<string>();

  constructor(private readonly alertingService: AlertingService) {}

  trackRequest(requestId: string, raffleId: number, ledger: number): void {
    this.pendingRequests.set(requestId, {
      requestId,
      raffleId,
      requestedAtLedger: ledger,
      timestamp: new Date(),
    });
  }

  fulfillRequest(requestId: string): void {
    if (this.firedAlerts.has(requestId)) {
      this.firedAlerts.delete(requestId);
      void this.alertingService.resolve(this.lagDedupKey(requestId));
    }
    this.pendingRequests.delete(requestId);
  }

  updateCurrentLedger(ledger: number): void {
    this.currentLedger = ledger;
    this.checkForLaggingRequests();
  }

  private checkForLaggingRequests(): void {
    for (const [requestId, request] of this.pendingRequests.entries()) {
      const lag = this.currentLedger - request.requestedAtLedger;
      if (lag >= this.LAG_THRESHOLD_LEDGERS) {
        this.logger.error(
          `ALERT: Request ${requestId} for raffle ${request.raffleId} not fulfilled within ${this.LAG_THRESHOLD_LEDGERS} ledgers. Lag: ${lag}`,
        );

        if (!this.firedAlerts.has(requestId)) {
          this.firedAlerts.add(requestId);
          void this.alertingService.fire({
            severity: 'warning',
            summary: `Oracle lag: request ${requestId} unfulfilled after ${lag} ledgers`,
            details: `Raffle ${request.raffleId} — requested at ledger ${request.requestedAtLedger}, current ledger ${this.currentLedger}. Threshold: ${this.LAG_THRESHOLD_LEDGERS} ledgers.`,
            dedupKey: this.lagDedupKey(requestId),
          });
        }

        this.pendingRequests.delete(requestId);
      }
    }
  }

  private lagDedupKey(requestId: string): string {
    return `tikka-oracle-lag-${requestId}`;
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  getPendingRequests(): PendingRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  getCurrentLedger(): number {
    return this.currentLedger;
  }

  getLagThresholdLedgers(): number {
    return this.LAG_THRESHOLD_LEDGERS;
  }
}

import { Injectable, Logger } from '@nestjs/common';

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

  trackRequest(requestId: string, raffleId: number, ledger: number): void {
    this.pendingRequests.set(requestId, {
      requestId,
      raffleId,
      requestedAtLedger: ledger,
      timestamp: new Date(),
    });
  }

  fulfillRequest(requestId: string): void {
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
        this.pendingRequests.delete(requestId);
      }
    }
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }
}

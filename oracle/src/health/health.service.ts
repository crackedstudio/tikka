import { Injectable, Logger } from '@nestjs/common';

export interface HealthMetrics {
  queueDepth: number;
  lastProcessedAt: Date | null;
  lastProcessedRequestId: string | null;
  totalProcessed: number;
  totalFailed: number;
  recentErrors: ErrorRecord[];
  uptime: number;
  streamStatus: 'connected' | 'disconnected' | 'reconnecting';
  streamUptimeMs: number;
  lastStreamError?: string;
  batchSubmissions: number;
  totalRevealsBatched: number;
  totalBatchFailures: number;
}

export interface ErrorRecord {
  requestId: string;
  raffleId: number;
  error: string;
  timestamp: Date;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();
  private queueDepth = 0;
  private lastProcessedAt: Date | null = null;
  private lastProcessedRequestId: string | null = null;
  private totalProcessed = 0;
  private totalFailed = 0;
  private recentErrors: ErrorRecord[] = [];
  private readonly MAX_ERROR_HISTORY = 10;
  private streamStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  private streamStartedAt: number | null = null;
  private lastStreamError?: string;
  private batchSubmissions = 0;
  private totalRevealsBatched = 0;
  private totalBatchFailures = 0;

  recordSuccess(requestId: string): void {
    this.lastProcessedAt = new Date();
    this.lastProcessedRequestId = requestId;
    this.totalProcessed++;
  }

  recordFailure(requestId: string, raffleId: number, error: string): void {
    this.totalFailed++;
    this.recentErrors.unshift({ requestId, raffleId, error, timestamp: new Date() });
    if (this.recentErrors.length > this.MAX_ERROR_HISTORY) {
      this.recentErrors = this.recentErrors.slice(0, this.MAX_ERROR_HISTORY);
    }
  }

  updateQueueDepth(depth: number): void {
    this.queueDepth = depth;
    if (depth > 10) {
      this.logger.warn(`High queue depth: ${depth}`);
    }
  }

  recordBatchSubmission(batchSize: number, successes: number, failures: number): void {
    this.batchSubmissions++;
    this.totalRevealsBatched += batchSize;
    this.totalBatchFailures += failures > 0 && successes === 0 ? 1 : 0;
  }

  updateStreamStatus(status: 'connected' | 'disconnected' | 'reconnecting', error?: string): void {
    this.streamStatus = status;
    if (status === 'connected') {
      this.streamStartedAt = Date.now();
      this.lastStreamError = undefined;
    } else if (status === 'disconnected') {
      this.streamStartedAt = null;
      if (error) this.lastStreamError = error;
    } else {
      if (error) this.lastStreamError = error;
    }
  }

  getMetrics(): HealthMetrics {
    return {
      queueDepth: this.queueDepth,
      lastProcessedAt: this.lastProcessedAt,
      lastProcessedRequestId: this.lastProcessedRequestId,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      recentErrors: this.recentErrors,
      uptime: Date.now() - this.startTime,
      streamStatus: this.streamStatus,
      streamUptimeMs: this.streamStartedAt ? Date.now() - this.streamStartedAt : 0,
      lastStreamError: this.lastStreamError,
      batchSubmissions: this.batchSubmissions,
      totalRevealsBatched: this.totalRevealsBatched,
      totalBatchFailures: this.totalBatchFailures,
    };
  }

  isHealthy(): boolean {
    if (this.streamStatus === 'disconnected') return false;
    if (this.queueDepth > 0 && this.lastProcessedAt) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (this.lastProcessedAt.getTime() < fiveMinutesAgo) return false;
    }
    if (this.queueDepth > 50) return false;
    return true;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { CircuitState } from '../listener/circuit-breaker.types';
import { PriorityTier } from '../queue/priority-classifier.service';

export { CircuitState };

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: ComponentStatus;
  message: string;
  lastCheckAt: Date;
}

export interface ComponentHealthStatus {
  listener: ComponentHealth;
  queue: ComponentHealth;
  keyProvider: ComponentHealth;
  randomnessProvider: ComponentHealth;
  network: ComponentHealth;
  submitter: ComponentHealth;
}

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
  multiOracle?: MultiOracleHealthStatus;
  circuitState: CircuitState;
  queueDepthByTier: {
    high: number;
    medium: number;
    low: number;
  };
  components: ComponentHealthStatus;
}

export interface MultiOracleHealthStatus {
  enabled: boolean;
  mode: string;
  localOracleId: string;
  threshold: number;
  totalOracles: number;
  pendingSubmissions: {
    raffleId: number;
    requestId: string;
    submissions: number;
    threshold: number;
  }[];
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
  private circuitState: CircuitState = 'closed';
  private tierCounts: Record<PriorityTier, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };

  // Component health tracking
  private componentHealth: ComponentHealthStatus = {
    listener: { status: 'unhealthy', message: 'Not initialized', lastCheckAt: new Date() },
    queue: { status: 'healthy', message: 'Queue initialized', lastCheckAt: new Date() },
    keyProvider: { status: 'unhealthy', message: 'Not initialized', lastCheckAt: new Date() },
    randomnessProvider: { status: 'unhealthy', message: 'Not initialized', lastCheckAt: new Date() },
    network: { status: 'unhealthy', message: 'Not initialized', lastCheckAt: new Date() },
    submitter: { status: 'healthy', message: 'Submitter initialized', lastCheckAt: new Date() },
  };

  private readonly QUEUE_DEPTH_THRESHOLD = 50;
  private readonly QUEUE_DEPTH_DEGRADED_THRESHOLD = 20;

  recordSuccess(requestId: string): void {
    this.lastProcessedAt = new Date();
    this.lastProcessedRequestId = requestId;
    this.totalProcessed++;
  }

  updateQueueDepth(depth: number): void {
    this.queueDepth = depth;
    
    // Update queue component health
    if (depth > this.QUEUE_DEPTH_THRESHOLD) {
      this.componentHealth.queue = {
        status: 'unhealthy',
        message: `Queue depth critically high: ${depth} items`,
        lastCheckAt: new Date(),
      };
    } else if (depth > this.QUEUE_DEPTH_DEGRADED_THRESHOLD) {
      this.componentHealth.queue = {
        status: 'degraded',
        message: `Queue depth elevated: ${depth} items`,
        lastCheckAt: new Date(),
      };
    } else {
      this.componentHealth.queue = {
        status: 'healthy',
        message: `Queue depth normal: ${depth} items`,
        lastCheckAt: new Date(),
      };
    }

    if (depth > 10) {
      this.logger.warn(`High queue depth: ${depth}`);
    }
  }

  updateStreamStatus(status: 'connected' | 'disconnected' | 'reconnecting', error?: string): void {
    this.streamStatus = status;
    
    // Update listener component health
    switch (status) {
      case 'connected':
        this.streamStartedAt = Date.now();
        this.lastStreamError = undefined;
        this.componentHealth.listener = {
          status: 'healthy',
          message: 'Listener connected and receiving events',
          lastCheckAt: new Date(),
        };
        break;
      case 'disconnected':
        this.streamStartedAt = null;
        if (error) this.lastStreamError = error;
        this.componentHealth.listener = {
          status: 'unhealthy',
          message: `Listener disconnected: ${error || 'Unknown error'}`,
          lastCheckAt: new Date(),
        };
        break;
      case 'reconnecting':
        if (error) this.lastStreamError = error;
        this.componentHealth.listener = {
          status: 'degraded',
          message: `Listener reconnecting: ${error || 'Connection lost'}`,
          lastCheckAt: new Date(),
        };
        break;
    }
  }

  updateCircuitState(state: CircuitState): void {
    this.circuitState = state;
  }

  incrementTierCount(tier: PriorityTier): void {
    this.tierCounts[tier]++;
  }

  decrementTierCount(tier: PriorityTier): void {
    this.tierCounts[tier] = Math.max(0, this.tierCounts[tier] - 1);
  }

  getQueueDepthByTier(): { high: number; medium: number; low: number } {
    return {
      high: this.tierCounts.HIGH,
      medium: this.tierCounts.MEDIUM,
      low: this.tierCounts.LOW,
    };
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
      circuitState: this.circuitState,
      queueDepthByTier: this.getQueueDepthByTier(),
      components: this.getComponentHealth(),
    };
  }

  isHealthy(): boolean {
    // Check if any critical component is unhealthy
    const components = this.getComponentHealth();
    if (components.listener.status === 'unhealthy') return false;
    if (components.queue.status === 'unhealthy') return false;
    if (components.keyProvider.status === 'unhealthy') return false;
    if (components.network.status === 'unhealthy') return false;

    // Legacy checks
    if (this.streamStatus === 'disconnected') return false;
    if (this.queueDepth > 0 && this.lastProcessedAt) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (this.lastProcessedAt.getTime() < fiveMinutesAgo) return false;
    }
    if (this.queueDepth > 50) return false;
    return true;
  }

  isDegraded(): boolean {
    const components = this.getComponentHealth();
    return Object.values(components).some(c => c.status === 'degraded');
  }

  // Component health tracking methods

  getComponentHealth(): ComponentHealthStatus {
    return { ...this.componentHealth };
  }

  updateKeyProviderStatus(status: ComponentStatus, message?: string): void {
    this.componentHealth.keyProvider = {
      status,
      message: message || (status === 'healthy' ? 'Key provider ready' : 'Key provider unavailable'),
      lastCheckAt: new Date(),
    };
    this.logger.log(`Key provider status: ${status} - ${message || ''}`);
  }

  updateRandomnessProviderStatus(status: ComponentStatus, message?: string): void {
    this.componentHealth.randomnessProvider = {
      status,
      message: message || (status === 'healthy' ? 'Randomness provider ready' : 'Randomness provider unavailable'),
      lastCheckAt: new Date(),
    };
    this.logger.log(`Randomness provider status: ${status} - ${message || ''}`);
  }

  updateNetworkStatus(status: ComponentStatus, message?: string): void {
    this.componentHealth.network = {
      status,
      message: message || (status === 'healthy' ? 'Network connectivity healthy' : 'Network issues detected'),
      lastCheckAt: new Date(),
    };
    this.logger.log(`Network status: ${status} - ${message || ''}`);
  }

  updateSubmitterStatus(status: ComponentStatus, message?: string): void {
    this.componentHealth.submitter = {
      status,
      message: message || (status === 'healthy' ? 'Submitter ready' : 'Submitter degraded'),
      lastCheckAt: new Date(),
    };
    this.logger.log(`Submitter status: ${status} - ${message || ''}`);
  }

  recordFailure(requestId: string, raffleId: number, error: string): void {
    this.totalFailed++;
    this.recentErrors.unshift({ requestId, raffleId, error, timestamp: new Date() });
    if (this.recentErrors.length > this.MAX_ERROR_HISTORY) {
      this.recentErrors = this.recentErrors.slice(0, this.MAX_ERROR_HISTORY);
    }

    // Update submitter status if failure rate is high
    this.updateSubmitterHealthBasedOnStats();
  }

  private updateSubmitterHealthBasedOnStats(): void {
    const total = this.totalProcessed + this.totalFailed;
    if (total === 0) return;

    const failureRate = this.totalFailed / total;
    
    if (failureRate > 0.5) {
      this.updateSubmitterStatus('unhealthy', `High failure rate: ${(failureRate * 100).toFixed(1)}%`);
    } else if (failureRate > 0.1) {
      this.updateSubmitterStatus('degraded', `Elevated failure rate: ${(failureRate * 100).toFixed(1)}%`);
    } else {
      this.updateSubmitterStatus('healthy', `Failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }
  }
}

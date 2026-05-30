import { Controller, Get } from '@nestjs/common';
import { HealthService, ComponentStatus } from './health.service';
import { LagMonitorService } from './lag-monitor.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { MultiOracleCoordinatorService } from '../multi-oracle/multi-oracle-coordinator.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { MetricsService } from '../metrics/metrics.service';

@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly lagMonitor: LagMonitorService,
    private readonly oracleRegistry: OracleRegistryService,
    private readonly multiOracleCoordinator: MultiOracleCoordinatorService,
    private readonly txSubmitter: TxSubmitterService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get('health')
  getHealth() {
    const isHealthy = this.healthService.isHealthy();
    const isDegraded = this.healthService.isDegraded();
    return {
      status: isHealthy ? 'healthy' : isDegraded ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString(),
      pendingLagRequests: this.lagMonitor.getPendingCount(),
    };
  }

  @Get('oracle/components')
  getComponentHealth() {
    const metrics = this.healthService.getMetrics();
    const components = metrics.components;

    return {
      timestamp: new Date().toISOString(),
      components: {
        listener: {
          status: components.listener.status,
          message: components.listener.message,
          lastCheckAt: components.listener.lastCheckAt.toISOString(),
        },
        queue: {
          status: components.queue.status,
          message: components.queue.message,
          depth: metrics.queueDepth,
          depthByTier: metrics.queueDepthByTier,
          lastCheckAt: components.queue.lastCheckAt.toISOString(),
        },
        keyProvider: {
          status: components.keyProvider.status,
          message: components.keyProvider.message,
          lastCheckAt: components.keyProvider.lastCheckAt.toISOString(),
        },
        randomnessProvider: {
          status: components.randomnessProvider.status,
          message: components.randomnessProvider.message,
          lastCheckAt: components.randomnessProvider.lastCheckAt.toISOString(),
        },
        network: {
          status: components.network.status,
          message: components.network.message,
          lastCheckAt: components.network.lastCheckAt.toISOString(),
        },
        submitter: {
          status: components.submitter.status,
          message: components.submitter.message,
          stats: {
            totalProcessed: metrics.totalProcessed,
            totalFailed: metrics.totalFailed,
            successRate: metrics.totalProcessed > 0
              ? ((metrics.totalProcessed / (metrics.totalProcessed + metrics.totalFailed)) * 100).toFixed(2) + '%'
              : 'N/A',
          },
          lastCheckAt: components.submitter.lastCheckAt.toISOString(),
        },
      },
      overallStatus: this.healthService.isHealthy() ? 'healthy' : this.healthService.isDegraded() ? 'degraded' : 'unhealthy',
    };
  @Get('metrics')
  async getMetrics() {
    return this.metricsService.getMetrics();
  }

  @Get('oracle/status')
  async getStatus() {
    const metrics = this.healthService.getMetrics();
    const isHealthy = this.healthService.isHealthy();
    const isDegraded = this.healthService.isDegraded();
    const multiOracleConfig = this.oracleRegistry.getConfig();
    const pendingTrackers = this.multiOracleCoordinator.getPendingTrackers();
    const rpcStatus = await this.txSubmitter.getRpcStatus();
    const pendingLag = this.lagMonitor.getPendingRequests();

    return {
      status: isHealthy ? 'healthy' : isDegraded ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString(),
      rpc: rpcStatus,
      metrics: {
        queueDepth: metrics.queueDepth,
        lastProcessedAt: metrics.lastProcessedAt,
        lastProcessedRequestId: metrics.lastProcessedRequestId,
        totalProcessed: metrics.totalProcessed,
        totalFailed: metrics.totalFailed,
        successRate: metrics.totalProcessed > 0
          ? ((metrics.totalProcessed / (metrics.totalProcessed + metrics.totalFailed)) * 100).toFixed(2) + '%'
          : 'N/A',
        uptimeMs: metrics.uptime,
        uptimeHours: (metrics.uptime / (1000 * 60 * 60)).toFixed(2),
        streamStatus: metrics.streamStatus,
        streamUptimeMs: metrics.streamUptimeMs,
        lastStreamError: metrics.lastStreamError,
      },
      queueDepthByTier: this.healthService.getQueueDepthByTier(),
      lag: {
        pendingCount: pendingLag.length,
        pendingRequests: pendingLag.map(r => ({
          requestId: r.requestId,
          raffleId: r.raffleId,
          requestedAtLedger: r.requestedAtLedger,
          age: new Date().toISOString(),
        })),
      },
      components: {
        listener: {
          status: metrics.components.listener.status,
          message: metrics.components.listener.message,
        },
        queue: {
          status: metrics.components.queue.status,
          message: metrics.components.queue.message,
        },
        keyProvider: {
          status: metrics.components.keyProvider.status,
          message: metrics.components.keyProvider.message,
        },
        randomnessProvider: {
          status: metrics.components.randomnessProvider.status,
          message: metrics.components.randomnessProvider.message,
        },
        network: {
          status: metrics.components.network.status,
          message: metrics.components.network.message,
        },
        submitter: {
          status: metrics.components.submitter.status,
          message: metrics.components.submitter.message,
        },
      },
      multiOracle: {
        enabled: multiOracleConfig.enabled,
        mode: multiOracleConfig.enabled ? 'multi-oracle' : 'single-oracle',
        localOracleId: multiOracleConfig.localOracleId,
        threshold: multiOracleConfig.threshold,
        totalOracles: multiOracleConfig.totalOracles,
        oracleIds: multiOracleConfig.oracleIds,
        pendingSubmissions: pendingTrackers,
      },
      recentErrors: metrics.recentErrors.map(err => ({
        requestId: err.requestId,
        raffleId: err.raffleId,
        error: err.error,
        timestamp: err.timestamp.toISOString(),
      })),
    };
  }
}

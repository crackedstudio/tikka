import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { LagMonitorService } from './lag-monitor.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { MultiOracleCoordinatorService } from '../multi-oracle/multi-oracle-coordinator.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';

@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly lagMonitor: LagMonitorService,
    private readonly oracleRegistry: OracleRegistryService,
    private readonly multiOracleCoordinator: MultiOracleCoordinatorService,
    private readonly txSubmitter: TxSubmitterService,
  ) {}

  @Get('health')
  getHealth() {
    const isHealthy = this.healthService.isHealthy();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      pendingLagRequests: this.lagMonitor.getPendingCount(),
    };
  }

  @Get('oracle/status')
  async getStatus() {
    const metrics = this.healthService.getMetrics();
    const isHealthy = this.healthService.isHealthy();
    const multiOracleConfig = this.oracleRegistry.getConfig();
    const pendingTrackers = this.multiOracleCoordinator.getPendingTrackers();
    const rpcStatus = await this.txSubmitter.getRpcStatus();
    const pendingLag = this.lagMonitor.getPendingRequests();

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
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
      lag: {
        pendingCount: pendingLag.length,
        pendingRequests: pendingLag.map(r => ({
          requestId: r.requestId,
          raffleId: r.raffleId,
          requestedAtLedger: r.requestedAtLedger,
          age: new Date().toISOString(),
        })),
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

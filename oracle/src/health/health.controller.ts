import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';

@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly txSubmitter: TxSubmitterService,
  ) {}

  @Get('health')
  getHealth() {
    const isHealthy = this.healthService.isHealthy();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('oracle/status')
  async getStatus() {
    const metrics = this.healthService.getMetrics();
    const isHealthy = this.healthService.isHealthy();
    const rpcStatus = await this.txSubmitter.getRpcStatus();

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
      recentErrors: metrics.recentErrors.map(err => ({
        requestId: err.requestId,
        raffleId: err.raffleId,
        error: err.error,
        timestamp: err.timestamp.toISOString(),
      })),
    };
  }
}

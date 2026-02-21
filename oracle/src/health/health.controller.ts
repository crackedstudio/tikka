import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth() {
    const isHealthy = this.healthService.isHealthy();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('oracle/status')
  getStatus() {
    const metrics = this.healthService.getMetrics();
    const isHealthy = this.healthService.isHealthy();
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
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

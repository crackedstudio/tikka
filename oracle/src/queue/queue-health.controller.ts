import { OracleLoggerService } from '../logger/oracle-logger';
import { Controller, Get, Logger } from '@nestjs/common';
import { JobStateManager } from './job-state-manager';
import { JobState, QueueMetrics } from './job-state.types';

/**
 * Health check and telemetry endpoint for queue monitoring.
 * Exposes read-only metrics for operator visibility and rescue tooling.
 */
@Controller('queue')
export class QueueHealthController {
  

  constructor(private readonly logger: OracleLoggerService, private readonly stateManager: JobStateManager) {}

  /**
   * Get comprehensive queue metrics aggregated by job state.
   * 
   * @returns QueueMetrics with counts for all states and aggregated pending/failed counts
   */
  @Get('metrics')
  getMetrics(): QueueMetrics {
    const metrics = this.stateManager.getMetrics();
    this.logger.debug(`Queue metrics requested: ${JSON.stringify(metrics)}`);
    return metrics;
  }

  /**
   * Get health status with focus on pending and failed jobs.
   * Useful for alerting and monitoring dashboards.
   * 
   * @returns Health status object with key indicators
   */
  @Get('health')
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    pendingCount: number;
    failedCount: number;
    deadLetteredCount: number;
    activeProcessing: number;
    maxConcurrency: number;
    timestamp: string;
  } {
    const metrics = this.stateManager.getMetrics();
    const config = this.stateManager.getConfig();
    const activeProcessing = this.stateManager.getActiveProcessingCount();

    // Determine health status based on thresholds
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (metrics.deadLetteredCount > 0) {
      status = 'unhealthy';
    } else if (metrics.failedCount > 5 || metrics.pendingCount > 50) {
      status = 'degraded';
    }

    const health = {
      status,
      pendingCount: metrics.pendingCount,
      failedCount: metrics.failedCount,
      deadLetteredCount: metrics.deadLetteredCount,
      activeProcessing,
      maxConcurrency: config.maxConcurrency,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug(`Queue health check: ${JSON.stringify(health)}`);
    return health;
  }

  /**
   * Get detailed information about jobs in a specific state.
   * Useful for debugging and rescue operations.
   * 
   * @param state - The job state to query (queued, generating, submitting, etc.)
   * @returns Array of job metadata for jobs in the specified state
   */
  @Get('jobs/:state')
  getJobsByState(state: string): any[] {
    const jobState = state.toUpperCase().replace(/-/g, '_') as JobState;
    
    if (!Object.values(JobState).includes(jobState)) {
      this.logger.warn(`Invalid job state requested: ${state}`);
      return [];
    }

    const jobs = this.stateManager.getJobsByState(jobState);
    
    this.logger.debug(`Jobs in state ${jobState}: ${jobs.length}`);
    
    // Return sanitized job info (exclude sensitive data if any)
    return jobs.map((job) => ({
      requestId: job.requestId,
      raffleId: job.raffleId,
      currentState: job.currentState,
      attemptCount: job.attemptCount,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString(),
      lastError: job.lastError,
      txHash: job.txHash,
      ledger: job.ledger,
      transitionCount: job.transitions.length,
    }));
  }

  /**
   * Get dead-lettered jobs that require manual intervention.
   * Critical endpoint for rescue operations.
   * 
   * @returns Array of dead-lettered job metadata
   */
  @Get('dead-letter')
  getDeadLetteredJobs(): any[] {
    const jobs = this.stateManager.getJobsByState(JobState.DEAD_LETTERED);
    
    this.logger.log(`Dead-lettered jobs query: ${jobs.length} jobs require rescue`);
    
    return jobs.map((job) => ({
      requestId: job.requestId,
      raffleId: job.raffleId,
      attemptCount: job.attemptCount,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString(),
      lastError: job.lastError,
      transitions: job.transitions.map((t) => ({
        from: t.fromState,
        to: t.toState,
        timestamp: new Date(t.timestamp).toISOString(),
        reason: t.reason,
        attemptNumber: t.attemptNumber,
      })),
    }));
  }

  /**
   * Get queue configuration for operator reference.
   * 
   * @returns Current queue configuration
   */
  @Get('config')
  getConfig(): any {
    const config = this.stateManager.getConfig();
    return {
      ...config,
      activeProcessing: this.stateManager.getActiveProcessingCount(),
    };
  }
}

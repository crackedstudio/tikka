import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HealthService } from './health.service';
import { ContractService } from '../contract/contract.service';

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private intervalId: NodeJS.Timeout;
  private readonly heartbeatIntervalMs: number;

  constructor(
    private readonly healthService: HealthService,
    private readonly contractService: ContractService,
  ) {
    // Default to 1 hour (3600000 ms) if not configured
    this.heartbeatIntervalMs = process.env.HEARTBEAT_INTERVAL_MS 
      ? parseInt(process.env.HEARTBEAT_INTERVAL_MS, 10) 
      : 3600000;
  }

  onModuleInit() {
    this.logger.log(`Starting Oracle Heartbeat Service with interval ${this.heartbeatIntervalMs}ms`);
    this.startHeartbeat();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private startHeartbeat() {
    this.intervalId = setInterval(async () => {
      await this.emitHeartbeat();
    }, this.heartbeatIntervalMs);
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
      this.logger.log('Oracle heartbeat emitted successfully: healthy');
      
    } catch (error) {
      this.logger.error(`Failed to emit oracle heartbeat: ${error.message}`, error.stack);
    }
  }
}

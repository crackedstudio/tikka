import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
import { HealthService } from '../health/health.service';

@Injectable()
export class StellarSubscriberService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StellarSubscriberService.name);
  private horizonServer: Horizon.Server;
  private closeStream: (() => void) | null = null;
  private lastMessageAt = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRestarting = false;
  
  private readonly HEARTBEAT_CHECK_MS = 30000; // 30s
  private readonly HEARTBEAT_TIMEOUT_MS = 60000; // 60s

  constructor(
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
  ) {
    const horizonUrl = this.configService.get<string>('HORIZON_URL', 'https://horizon-testnet.stellar.org');
    this.horizonServer = new Horizon.Server(horizonUrl);
  }

  onModuleInit() {
    this.startStream();
    this.startHeartbeatCheck();
  }

  onModuleDestroy() {
    this.stopStream();
    this.stopHeartbeatCheck();
  }

  private startStream() {
    this.logger.log('Starting Horizon SSE stream...');
    // Status is set to 'reconnecting' or 'disconnected' before calling this

    try {
      this.closeStream = this.horizonServer.transactions()
        .cursor('now')
        .stream({
          onmessage: (tx) => {
            this.handleMessage(tx);
          },
          onerror: (error) => {
            this.handleError(error);
          },
        });

      // We mark as connected only after the first message/heartbeat arrives
      // to ensure the stream is actually receiving data.
      this.lastMessageAt = Date.now();
      this.logger.log('SSE stream request initiated');
    } catch (error) {
      this.handleError(error);
    }
  }

  private stopStream() {
    if (this.closeStream) {
      try {
        this.closeStream();
      } catch (e) {
        this.logger.warn(`Error closing stream: ${e.message}`);
      }
      this.closeStream = null;
    }
    this.healthService.updateStreamStatus('disconnected');
  }

  private handleMessage(message: any) {
    this.lastMessageAt = Date.now();
    
    // Ensure status is 'connected'
    if (this.healthService.getMetrics().streamStatus !== 'connected') {
      this.healthService.updateStreamStatus('connected');
      this.logger.log('SSE stream connected (data received)');
    }

    // Horizon heartbeats are empty objects {}
    if (Object.keys(message).length === 0) {
      this.logger.debug('Received Horizon keep-alive');
    } else {
      this.logger.debug(`Received transaction: ${message.hash}`);
    }
  }

  private handleError(error: any) {
    const errorMsg = error.message || String(error);
    this.logger.error(`SSE stream error: ${errorMsg}`);
    this.healthService.updateStreamStatus('disconnected', errorMsg);
  }

  private startHeartbeatCheck() {
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeat();
    }, this.HEARTBEAT_CHECK_MS);
  }

  private stopHeartbeatCheck() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private checkHeartbeat() {
    const elapsed = Date.now() - this.lastMessageAt;
    this.logger.debug(`Heartbeat check: ${elapsed}ms since last message`);

    if (elapsed > this.HEARTBEAT_TIMEOUT_MS) {
      this.logger.warn(`SSE stream heartbeat timeout (${elapsed}ms). Restarting stream...`);
      this.restartStream(`Heartbeat timeout: ${elapsed}ms elapsed`);
    }
  }

  private restartStream(reason: string) {
    if (this.isRestarting) return;
    this.isRestarting = true;

    this.logger.log(`Restarting SSE stream. Reason: ${reason}`);
    this.stopStream();
    this.healthService.updateStreamStatus('reconnecting', reason);
    
    // Use a small delay before reconnecting
    setTimeout(() => {
      this.isRestarting = false;
      if (!this.closeStream) {
        this.startStream();
      }
    }, 5000);
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OracleConfig,
  StellarNetworkConfig,
  KeyProviderConfig,
  QueueConfig,
  VrfConfig,
  CircuitBreakerConfig,
  PriorityQueueConfig,
  FeeConfig,
  TxSubmissionConfig,
  MultiOracleConfig,
  SupabaseConfig,
  AlertingConfig,
  HeartbeatConfig,
  EventListenerConfig,
  LoggingConfig,
  ServerConfig,
} from './config.schema';

/**
 * Type-safe configuration service for the Oracle.
 * Provides strongly-typed access to validated configuration.
 */
@Injectable()
export class OracleConfigService {
  private readonly config: OracleConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<OracleConfig>('loadOracleConfig')!;
  }

  /**
   * Get the complete configuration object
   */
  getConfig(): OracleConfig {
    return this.config;
  }

  /**
   * Server configuration
   */
  getServer(): ServerConfig {
    return this.config.server;
  }

  /**
   * Stellar network configuration (Horizon, Soroban RPC, contract IDs)
   */
  getStellar(): StellarNetworkConfig {
    return this.config.stellar;
  }

  /**
   * Key provider configuration (env, AWS KMS, GCP KMS)
   */
  getKeyProvider(): KeyProviderConfig {
    return this.config.keyProvider;
  }

  /**
   * Queue configuration (Redis, retries, timeouts)
   */
  getQueue(): QueueConfig {
    return this.config.queue;
  }

  /**
   * VRF configuration (threshold for VRF vs PRNG)
   */
  getVrf(): VrfConfig {
    return this.config.vrf;
  }

  /**
   * Circuit breaker configuration
   */
  getCircuitBreaker(): CircuitBreakerConfig {
    return this.config.circuitBreaker;
  }

  /**
   * Priority queue configuration
   */
  getPriorityQueue(): PriorityQueueConfig {
    return this.config.priorityQueue;
  }

  /**
   * Fee configuration
   */
  getFee(): FeeConfig {
    return this.config.fee;
  }

  /**
   * Transaction submission configuration
   */
  getTxSubmission(): TxSubmissionConfig {
    return this.config.txSubmission;
  }

  /**
   * Multi-oracle configuration
   */
  getMultiOracle(): MultiOracleConfig {
    return this.config.multiOracle;
  }

  /**
   * Supabase configuration (optional)
   */
  getSupabase(): SupabaseConfig | undefined {
    return this.config.supabase;
  }

  /**
   * Alerting configuration
   */
  getAlerting(): AlertingConfig {
    return this.config.alerting;
  }

  /**
   * Heartbeat configuration
   */
  getHeartbeat(): HeartbeatConfig {
    return this.config.heartbeat;
  }

  /**
   * Event listener configuration
   */
  getEventListener(): EventListenerConfig {
    return this.config.eventListener;
  }

  /**
   * Logging configuration
   */
  getLogging(): LoggingConfig {
    return this.config.logging;
  }
}

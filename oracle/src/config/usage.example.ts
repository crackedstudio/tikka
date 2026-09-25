/**
 * Usage Examples for Oracle Configuration System
 * 
 * This file demonstrates how to use the OracleConfigService in various scenarios.
 * These are examples only - not meant to be executed.
 */

import { Injectable } from '@nestjs/common';
import { OracleConfigService } from './oracle-config.service';

// ============================================================================
// Example 1: Basic Service Usage
// ============================================================================

@Injectable()
export class ExampleService {
  constructor(private readonly config: OracleConfigService) {}

  async connectToStellar() {
    const stellar = this.config.getStellar();
    
    console.log(`Connecting to Horizon: ${stellar.horizonUrl}`);
    console.log(`Connecting to Soroban RPC: ${stellar.sorobanRpcUrl}`);
    console.log(`Contract ID: ${stellar.raffleContractId}`);
    console.log(`Network: ${stellar.networkPassphrase}`);
    
    // Fallback URLs are available as an array
    if (stellar.sorobanRpcFallbackUrls.length > 0) {
      console.log(`Fallback RPCs: ${stellar.sorobanRpcFallbackUrls.join(', ')}`);
    }
  }
}

// ============================================================================
// Example 2: Type-Safe Key Provider Access
// ============================================================================

@Injectable()
export class KeyManagementExample {
  constructor(private readonly config: OracleConfigService) {}

  async initializeKeys() {
    const keyProvider = this.config.getKeyProvider();
    
    // TypeScript discriminated union provides type safety
    switch (keyProvider.type) {
      case 'env':
        console.log('Using environment-based key provider');
        // keyProvider.privateKey is available here
        break;
        
      case 'aws-kms':
        console.log(`Using AWS KMS in region: ${keyProvider.awsRegion}`);
        console.log(`Key ID: ${keyProvider.awsKeyId}`);
        // keyProvider.privateKey is NOT available (TypeScript error)
        break;
        
      case 'gcp-kms':
        console.log(`Using GCP KMS in project: ${keyProvider.gcpProjectId}`);
        console.log(`Key Ring: ${keyProvider.gcpKeyRingId}`);
        console.log(`Key: ${keyProvider.gcpKeyId}`);
        break;
    }
  }
}

// ============================================================================
// Example 3: Queue Configuration
// ============================================================================

@Injectable()
export class QueueExample {
  constructor(private readonly config: OracleConfigService) {}

  getQueueSettings() {
    const queue = this.config.getQueue();
    
    return {
      redis: {
        host: queue.redis.host,
        port: queue.redis.port,
      },
      retry: {
        maxRetries: queue.maxRetries,
        initialBackoff: queue.initialBackoffMs,
        backoffMultiplier: queue.backoffMultiplier,
        maxBackoff: queue.maxBackoffMs,
      },
      timeouts: {
        confirmation: queue.confirmationTimeoutMs,
        generation: queue.generationTimeoutMs,
        submission: queue.submissionTimeoutMs,
      },
      concurrency: queue.maxConcurrency,
    };
  }
}

// ============================================================================
// Example 4: Randomness Method Selection
// ============================================================================

@Injectable()
export class RandomnessExample {
  constructor(private readonly config: OracleConfigService) {}

  determineRandomnessMethod(prizeAmountXlm: number): 'VRF' | 'PRNG' {
    const vrf = this.config.getVrf();
    
    if (prizeAmountXlm >= vrf.thresholdXlm) {
      return 'VRF';
    }
    return 'PRNG';
  }
  
  classifyPriority(prizeAmountXlm: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    const priority = this.config.getPriorityQueue();
    
    if (prizeAmountXlm >= priority.highValueThresholdXlm) {
      return 'HIGH';
    }
    if (prizeAmountXlm >= priority.medValueThresholdXlm) {
      return 'MEDIUM';
    }
    return 'LOW';
  }
}

// ============================================================================
// Example 5: Fee Calculation
// ============================================================================

@Injectable()
export class FeeExample {
  constructor(private readonly config: OracleConfigService) {}

  calculateFee(estimatedFee: number, prizeAmountXlm: number): number {
    const fee = this.config.getFee();
    
    // Apply fee caps
    let finalFee = Math.max(estimatedFee, fee.minFeeStroops);
    finalFee = Math.min(finalFee, fee.maxFeeStroops);
    
    // Low stakes optimization
    if (prizeAmountXlm < fee.lowStakesThresholdXlm) {
      finalFee = Math.min(finalFee, fee.minFeeStroops * 2);
    }
    
    return finalFee;
  }
}

// ============================================================================
// Example 6: Circuit Breaker
// ============================================================================

@Injectable()
export class CircuitBreakerExample {
  private consecutiveFailures = 0;
  
  constructor(private readonly config: OracleConfigService) {}

  shouldAttemptConnection(): boolean {
    const cb = this.config.getCircuitBreaker();
    
    if (this.consecutiveFailures >= cb.failureThreshold) {
      console.log('Circuit breaker OPEN - connection attempts blocked');
      return false;
    }
    
    return true;
  }
  
  recordFailure() {
    const cb = this.config.getCircuitBreaker();
    this.consecutiveFailures++;
    
    if (this.consecutiveFailures >= cb.failureThreshold) {
      console.log(`Circuit opened after ${cb.failureThreshold} failures`);
      console.log(`Will retry after ${cb.resetTimeoutMs}ms`);
    }
  }
}

// ============================================================================
// Example 7: Multi-Oracle Coordination
// ============================================================================

@Injectable()
export class MultiOracleExample {
  constructor(private readonly config: OracleConfigService) {}

  isMultiOracleMode(): boolean {
    const multiOracle = this.config.getMultiOracle();
    return multiOracle.mode === 'multi' || multiOracle.enabled;
  }
  
  getThreshold(): number {
    const multiOracle = this.config.getMultiOracle();
    return multiOracle.threshold || 1;
  }
  
  getLocalOracleId(): string | undefined {
    const multiOracle = this.config.getMultiOracle();
    return multiOracle.localOracleId;
  }
}

// ============================================================================
// Example 8: Alerting
// ============================================================================

@Injectable()
export class AlertingExample {
  constructor(private readonly config: OracleConfigService) {}

  async sendAlert(message: string) {
    const alerting = this.config.getAlerting();
    
    switch (alerting.provider) {
      case 'pagerduty':
        if (alerting.pagerdutyRoutingKey) {
          console.log(`Sending PagerDuty alert: ${message}`);
          // Send to PagerDuty...
        }
        break;
        
      case 'opsgenie':
        if (alerting.opsgenieApiKey) {
          console.log(`Sending Opsgenie alert: ${message}`);
          // Send to Opsgenie...
        }
        break;
        
      case 'none':
        console.log(`Alert (not sent): ${message}`);
        break;
    }
  }
}

// ============================================================================
// Example 9: Supabase Audit Logging
// ============================================================================

@Injectable()
export class AuditExample {
  constructor(private readonly config: OracleConfigService) {}

  isAuditEnabled(): boolean {
    const supabase = this.config.getSupabase();
    return supabase !== undefined;
  }
  
  getSupabaseConfig() {
    const supabase = this.config.getSupabase();
    
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    return {
      url: supabase.url,
      key: supabase.serviceRoleKey,
    };
  }
}

// ============================================================================
// Example 10: Complete Configuration Access
// ============================================================================

@Injectable()
export class ConfigDumpExample {
  constructor(private readonly config: OracleConfigService) {}

  dumpConfiguration() {
    // Get all configuration sections
    const fullConfig = {
      server: this.config.getServer(),
      stellar: this.config.getStellar(),
      keyProvider: this.config.getKeyProvider(),
      queue: this.config.getQueue(),
      vrf: this.config.getVrf(),
      circuitBreaker: this.config.getCircuitBreaker(),
      priorityQueue: this.config.getPriorityQueue(),
      fee: this.config.getFee(),
      txSubmission: this.config.getTxSubmission(),
      multiOracle: this.config.getMultiOracle(),
      supabase: this.config.getSupabase(),
      alerting: this.config.getAlerting(),
      heartbeat: this.config.getHeartbeat(),
      eventListener: this.config.getEventListener(),
      logging: this.config.getLogging(),
    };
    
    // Redact sensitive information before logging
    const redacted = {
      ...fullConfig,
      keyProvider: { type: fullConfig.keyProvider.type },
      supabase: fullConfig.supabase ? { url: fullConfig.supabase.url } : undefined,
      alerting: { provider: fullConfig.alerting.provider },
    };
    
    console.log('Oracle Configuration:', JSON.stringify(redacted, null, 2));
  }
}

#!/usr/bin/env ts-node
/**
 * Configuration Verification Script
 * 
 * Run this script to verify your environment configuration:
 * 
 *   ts-node src/config/verify-config.ts
 * 
 * This will:
 * 1. Load environment variables from .env (if present)
 * 2. Validate configuration against schema
 * 3. Display configuration summary (with secrets redacted)
 * 4. Report any validation errors
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { loadOracleConfig } from './config.loader';

// Load .env file if it exists
const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

console.log('='.repeat(80));
console.log('Oracle Configuration Verification');
console.log('='.repeat(80));
console.log();

try {
  const config = loadOracleConfig();
  
  console.log('✅ Configuration loaded and validated successfully!');
  console.log();
  
  // Display configuration summary with sensitive data redacted
  console.log('Configuration Summary:');
  console.log('-'.repeat(80));
  
  console.log('\n📡 Server:');
  console.log(`  Port: ${config.server.port}`);
  console.log(`  Environment: ${config.server.nodeEnv}`);
  
  console.log('\n🌟 Stellar Network:');
  console.log(`  Horizon URL: ${config.stellar.horizonUrl}`);
  console.log(`  Soroban RPC URL: ${config.stellar.sorobanRpcUrl}`);
  console.log(`  Fallback RPCs: ${config.stellar.sorobanRpcFallbackUrls.length} configured`);
  console.log(`  Network: ${config.stellar.networkPassphrase}`);
  console.log(`  Contract ID: ${config.stellar.raffleContractId}`);
  
  console.log('\n🔑 Key Provider:');
  console.log(`  Type: ${config.keyProvider.type}`);
  if (config.keyProvider.type === 'aws-kms') {
    console.log(`  AWS Region: ${config.keyProvider.awsRegion}`);
    console.log(`  AWS Key ID: ${config.keyProvider.awsKeyId.substring(0, 20)}...`);
  } else if (config.keyProvider.type === 'gcp-kms') {
    console.log(`  GCP Project: ${config.keyProvider.gcpProjectId}`);
    console.log(`  GCP Key Ring: ${config.keyProvider.gcpKeyRingId}`);
    console.log(`  GCP Key: ${config.keyProvider.gcpKeyId}`);
  } else {
    console.log(`  Private Key: [REDACTED]`);
  }
  
  console.log('\n📦 Queue:');
  console.log(`  Redis: ${config.queue.redis.host}:${config.queue.redis.port}`);
  console.log(`  Max Retries: ${config.queue.maxRetries}`);
  console.log(`  Max Concurrency: ${config.queue.maxConcurrency}`);
  
  console.log('\n🎲 VRF:');
  console.log(`  Threshold: ${config.vrf.thresholdXlm} XLM`);
  
  console.log('\n⚡ Circuit Breaker:');
  console.log(`  Failure Threshold: ${config.circuitBreaker.failureThreshold}`);
  console.log(`  Reset Timeout: ${config.circuitBreaker.resetTimeoutMs}ms`);
  
  console.log('\n📊 Priority Queue:');
  console.log(`  High Value Threshold: ${config.priorityQueue.highValueThresholdXlm} XLM`);
  console.log(`  Medium Value Threshold: ${config.priorityQueue.medValueThresholdXlm} XLM`);
  
  console.log('\n💰 Fees:');
  console.log(`  Max Fee: ${config.fee.maxFeeStroops} stroops`);
  console.log(`  Min Fee: ${config.fee.minFeeStroops} stroops`);
  console.log(`  Low Stakes Threshold: ${config.fee.lowStakesThresholdXlm} XLM`);
  
  console.log('\n📤 Transaction Submission:');
  console.log(`  Max Attempts: ${config.txSubmission.maxAttempts}`);
  console.log(`  Initial Backoff: ${config.txSubmission.initialBackoffMs}ms`);
  console.log(`  Alert Webhook: ${config.txSubmission.alertWebhookUrl ? 'Configured' : 'Not configured'}`);
  
  console.log('\n🔗 Multi-Oracle:');
  console.log(`  Mode: ${config.multiOracle.mode}`);
  console.log(`  Enabled: ${config.multiOracle.enabled}`);
  if (config.multiOracle.localOracleId) {
    console.log(`  Local Oracle ID: ${config.multiOracle.localOracleId}`);
  }
  if (config.multiOracle.threshold) {
    console.log(`  Threshold: ${config.multiOracle.threshold}`);
  }
  
  if (config.supabase) {
    console.log('\n💾 Supabase:');
    console.log(`  URL: ${config.supabase.url}`);
    console.log(`  Service Role Key: [REDACTED]`);
  }
  
  console.log('\n🚨 Alerting:');
  console.log(`  Provider: ${config.alerting.provider}`);
  if (config.alerting.provider === 'pagerduty') {
    console.log(`  PagerDuty Routing Key: [REDACTED]`);
  } else if (config.alerting.provider === 'opsgenie') {
    console.log(`  Opsgenie API Key: [REDACTED]`);
  }
  
  console.log('\n💓 Heartbeat:');
  console.log(`  Interval: ${config.heartbeat.intervalMs}ms`);
  console.log(`  Alert Timeout: ${config.heartbeat.alertTimeoutMs}ms`);
  
  console.log('\n📻 Event Listener:');
  console.log(`  Initial Retry Delay: ${config.eventListener.initialRetryDelayMs}ms`);
  console.log(`  Max Retry Delay: ${config.eventListener.maxRetryDelayMs}ms`);
  console.log(`  Draw Request Replay: ${config.eventListener.drawRequestReplay}`);
  
  console.log('\n📝 Logging:');
  console.log(`  Level: ${config.logging.level}`);
  console.log(`  Directory: ${config.logging.dir}`);
  console.log(`  Console: ${config.logging.toConsole}`);
  console.log(`  Max Size: ${config.logging.maxSize}`);
  console.log(`  Max Files: ${config.logging.maxFiles}`);
  
  console.log();
  console.log('='.repeat(80));
  console.log('✅ All configuration checks passed!');
  console.log('='.repeat(80));
  
  process.exit(0);
  
} catch (error) {
  console.log('❌ Configuration validation failed!');
  console.log();
  console.log('Error Details:');
  console.log('-'.repeat(80));
  
  if (error instanceof Error) {
    console.error(error.message);
    
    // Try to parse Zod error for better formatting
    try {
      const errorObj = JSON.parse(error.message);
      if (Array.isArray(errorObj)) {
        console.log();
        console.log('Validation Errors:');
        errorObj.forEach((err: any, index: number) => {
          console.log(`  ${index + 1}. ${err.path.join('.')}: ${err.message}`);
        });
      }
    } catch {
      // Not a Zod error, just display the message
    }
  } else {
    console.error(error);
  }
  
  console.log();
  console.log('='.repeat(80));
  console.log('Please fix the configuration errors and try again.');
  console.log('See oracle/src/config/ENVIRONMENT_VARIABLES.md for documentation.');
  console.log('='.repeat(80));
  
  process.exit(1);
}

import { OracleConfig } from './config.schema';

export interface ConfigIssueLine {
  field: string;
  message: string;
}

/**
 * CLI presentation for configuration verification.
 * Service code must not print; operators read this from `npm run config:verify`.
 */
export class ConfigPresenter {
  static printBanner(): void {
    console.log('='.repeat(80));
    console.log('Oracle Configuration Verification');
    console.log('='.repeat(80));
    console.log();
  }

  static reportIssues(result: { ok: boolean; warnings: ConfigIssueLine[]; errors: ConfigIssueLine[] }): number {
    if (result.warnings.length > 0) {
      console.warn('Configuration warnings:');
      result.warnings.forEach((w, i) => {
        console.warn(`  ${i + 1}. [${w.field}] ${w.message}`);
      });
      console.warn('');
    }

    if (!result.ok) {
      console.error('Configuration validation failed. Invalid fields:');
      result.errors.forEach((e, i) => {
        console.error(`  ${i + 1}. [${e.field}] ${e.message}`);
      });
      console.error('');
      console.error('Fix the configuration and retry.');
      console.error('See oracle/src/config/ENVIRONMENT_VARIABLES.md for documentation.');
      return 1;
    }

    return 0;
  }

  static printSummary(config: OracleConfig): void {
    console.log('✅ Configuration loaded and validated successfully!');
    console.log();

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
      console.log('  Private Key: [REDACTED]');
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
    console.log(
      `  Alert Webhook: ${config.txSubmission.alertWebhookUrl ? 'Configured' : 'Not configured'}`,
    );

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
      console.log('  Service Role Key: [REDACTED]');
    }

    console.log('\n🚨 Alerting:');
    console.log(`  Provider: ${config.alerting.provider}`);
    if (config.alerting.provider === 'pagerduty') {
      console.log('  PagerDuty Routing Key: [REDACTED]');
    } else if (config.alerting.provider === 'opsgenie') {
      console.log('  Opsgenie API Key: [REDACTED]');
    }
    console.log(`  Alert Webhook: ${config.alerting.webhookUrl ? 'Configured' : 'Not configured'}`);

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
  }
}

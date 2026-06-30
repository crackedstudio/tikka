import { Logger } from '@nestjs/common';
import { OracleConfigSchema, OracleConfig, KeyProviderConfig } from './config.schema';

const logger = new Logger('ConfigLoader');

/**
 * Parse boolean from string environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer from string environment variable
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float from string environment variable
 */
function parseFloat(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse comma-separated URLs
 */
function parseUrlArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

/**
 * Load key provider configuration from environment
 */
function loadKeyProviderConfig(): KeyProviderConfig {
  const providerType = (process.env.KEY_PROVIDER || 'env').toLowerCase();

  switch (providerType) {
    case 'aws-kms':
    case 'aws':
      return {
        type: 'aws-kms',
        awsRegion: process.env.AWS_REGION || '',
        awsKeyId: process.env.AWS_KMS_KEY_ID || '',
      };

    case 'gcp-kms':
    case 'gcp':
    case 'google':
      return {
        type: 'gcp-kms',
        gcpProjectId: process.env.GCP_PROJECT_ID || '',
        gcpLocationId: process.env.GCP_LOCATION_ID || 'global',
        gcpKeyRingId: process.env.GCP_KEY_RING_ID || '',
        gcpKeyId: process.env.GCP_KEY_ID || '',
        gcpKeyVersion: process.env.GCP_KEY_VERSION || '1',
      };

    case 'env':
    default:
      return {
        type: 'env',
        privateKey:
          process.env.ORACLE_SECRET_KEY ||
          process.env.ORACLE_PRIVATE_KEY ||
          '',
      };
  }
}

/**
 * Load and validate oracle configuration from environment variables
 */
export function loadOracleConfig(): OracleConfig {
  const rawConfig = {
    server: {
      port: parseInteger(process.env.PORT, 3003),
      nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
    },
    stellar: {
      horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
      sorobanRpcFallbackUrls: parseUrlArray(process.env.SOROBAN_RPC_FALLBACK_URLS),
      networkPassphrase: process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
      raffleContractId: process.env.RAFFLE_CONTRACT_ID || '',
    },
    keyProvider: loadKeyProviderConfig(),
    queue: {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInteger(process.env.REDIS_PORT, 6379),
      },
      maxRetries: parseInteger(process.env.QUEUE_MAX_RETRIES, 3),
      initialBackoffMs: parseInteger(process.env.QUEUE_INITIAL_BACKOFF_MS, 2000),
      backoffMultiplier: parseFloat(process.env.QUEUE_BACKOFF_MULTIPLIER, 2),
      maxBackoffMs: parseInteger(process.env.QUEUE_MAX_BACKOFF_MS, 60000),
      confirmationTimeoutMs: parseInteger(process.env.QUEUE_CONFIRMATION_TIMEOUT_MS, 300000),
      maxConcurrency: parseInteger(process.env.QUEUE_MAX_CONCURRENCY, 5),
      generationTimeoutMs: parseInteger(process.env.QUEUE_GENERATION_TIMEOUT_MS, 30000),
      submissionTimeoutMs: parseInteger(process.env.QUEUE_SUBMISSION_TIMEOUT_MS, 120000),
    },
    vrf: {
      thresholdXlm: parseFloat(process.env.VRF_THRESHOLD_XLM, 500),
    },
    circuitBreaker: {
      failureThreshold: parseInteger(process.env.ORACLE_CB_FAILURE_THRESHOLD, 5),
      resetTimeoutMs: parseInteger(process.env.ORACLE_CB_RESET_TIMEOUT_MS, 60000),
    },
    priorityQueue: {
      highValueThresholdXlm: parseFloat(process.env.ORACLE_HIGH_VALUE_THRESHOLD_XLM, 10000),
      medValueThresholdXlm: parseFloat(process.env.ORACLE_MED_VALUE_THRESHOLD_XLM, 1000),
    },
    fee: {
      maxFeeStroops: parseInteger(process.env.ORACLE_MAX_FEE_STROOPS, 100000000),
      minFeeStroops: parseInteger(process.env.ORACLE_MIN_FEE_STROOPS, 100),
      lowStakesThresholdXlm: parseFloat(process.env.LOW_STAKES_THRESHOLD_XLM, 500),
    },
    txSubmission: {
      maxAttempts: parseInteger(process.env.TX_SUBMIT_MAX_ATTEMPTS, 5),
      initialBackoffMs: parseInteger(process.env.TX_SUBMIT_INITIAL_BACKOFF_MS, 1000),
      alertWebhookUrl: process.env.TX_SUBMIT_ALERT_WEBHOOK_URL,
    },
    multiOracle: {
      mode: (process.env.ORACLE_MODE || 'single') as 'single' | 'multi',
      enabled: parseBoolean(process.env.MULTI_ORACLE_ENABLED, false),
      localOracleId: process.env.LOCAL_ORACLE_ID,
      registry: process.env.ORACLE_REGISTRY,
      peers: process.env.ORACLE_PEERS,
      secrets: process.env.ORACLE_SECRETS,
      threshold: process.env.MULTI_ORACLE_THRESHOLD
        ? parseInteger(process.env.MULTI_ORACLE_THRESHOLD, 0)
        : undefined,
      timeoutMs: parseInteger(process.env.ORACLE_MULTI_TIMEOUT_MS, 10000),
    },
    supabase: process.env.SUPABASE_URL
      ? {
          url: process.env.SUPABASE_URL,
          serviceRoleKey:
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_ANON_KEY ||
            '',
          anonKey: process.env.SUPABASE_ANON_KEY,
        }
      : undefined,
    alerting: {
      provider: (process.env.ALERTING_PROVIDER || 'none') as 'none' | 'pagerduty' | 'opsgenie',
      pagerdutyRoutingKey: process.env.PAGERDUTY_ROUTING_KEY,
      opsgenieApiKey: process.env.OPSGENIE_API_KEY,
    },
    heartbeat: {
      intervalMs: parseInteger(process.env.HEARTBEAT_INTERVAL_MS, 3600000),
      alertTimeoutMs: parseInteger(process.env.HEARTBEAT_ALERT_TIMEOUT_MS, 90000),
    },
    eventListener: {
      initialRetryDelayMs: parseInteger(process.env.EVENT_LISTENER_INITIAL_RETRY_DELAY, 1000),
      maxRetryDelayMs: parseInteger(process.env.EVENT_LISTENER_MAX_RETRY_DELAY, 60000),
      drawRequestReplay: parseBoolean(process.env.ORACLE_DRAW_REQUEST_REPLAY, false),
    },
    logging: {
      level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug' | 'verbose',
      dir: process.env.LOG_DIR || './logs',
      toConsole: parseBoolean(process.env.LOG_TO_CONSOLE, true),
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      zippedArchive: parseBoolean(process.env.LOG_ZIPPED_ARCHIVE, true),
    },
  };

  try {
    const validated = OracleConfigSchema.parse(rawConfig);
    logger.log('Configuration loaded and validated successfully');
    return validated;
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Configuration validation failed:', error.message);
      throw new Error(`Invalid configuration: ${error.message}`);
    }
    throw error;
  }
}

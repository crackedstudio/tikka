import { z } from 'zod';

/**
 * Stellar Network Configuration Schema
 */
const StellarNetworkSchema = z.object({
  horizonUrl: z.string().url(),
  sorobanRpcUrl: z.string().url(),
  sorobanRpcFallbackUrls: z.array(z.string().url()).default([]),
  networkPassphrase: z.string().min(1),
  raffleContractId: z.string().min(1),
});

/**
 * Key Provider Configuration Schema
 */
const KeyProviderSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('env'),
    privateKey: z.string().min(1),
  }),
  z.object({
    type: z.literal('aws-kms'),
    awsRegion: z.string().min(1),
    awsKeyId: z.string().min(1),
  }),
  z.object({
    type: z.literal('gcp-kms'),
    gcpProjectId: z.string().min(1),
    gcpLocationId: z.string().default('global'),
    gcpKeyRingId: z.string().min(1),
    gcpKeyId: z.string().min(1),
    gcpKeyVersion: z.string().default('1'),
  }),
]);

/**
 * Queue Configuration Schema
 */
const QueueConfigSchema = z.object({
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(6379),
  }),
  maxRetries: z.number().int().nonnegative().default(3),
  initialBackoffMs: z.number().int().positive().default(2000),
  backoffMultiplier: z.number().positive().default(2),
  maxBackoffMs: z.number().int().positive().default(60000),
  confirmationTimeoutMs: z.number().int().positive().default(300000),
  maxConcurrency: z.number().int().positive().default(5),
  generationTimeoutMs: z.number().int().positive().default(30000),
  submissionTimeoutMs: z.number().int().positive().default(120000),
});

/**
 * VRF Configuration Schema
 */
const VrfConfigSchema = z.object({
  thresholdXlm: z.number().positive().default(500),
});

/**
 * Circuit Breaker Configuration Schema
 */
const CircuitBreakerSchema = z.object({
  failureThreshold: z.number().int().positive().default(5),
  resetTimeoutMs: z.number().int().positive().default(60000),
});

/**
 * Priority Queue Configuration Schema
 */
const PriorityQueueSchema = z.object({
  highValueThresholdXlm: z.number().positive().default(10000),
  medValueThresholdXlm: z.number().positive().default(1000),
}).refine(
  (data) => data.medValueThresholdXlm < data.highValueThresholdXlm,
  {
    message: 'medValueThresholdXlm must be less than highValueThresholdXlm',
    path: ['medValueThresholdXlm'],
  },
);

/**
 * Fee Configuration Schema
 */
const FeeConfigSchema = z.object({
  maxFeeStroops: z.number().int().positive().default(100000000), // 10 XLM
  minFeeStroops: z.number().int().positive().default(100),
  lowStakesThresholdXlm: z.number().positive().default(500),
});

/**
 * Transaction Submission Configuration Schema
 */
const TxSubmissionSchema = z.object({
  maxAttempts: z.number().int().positive().default(5),
  initialBackoffMs: z.number().int().positive().default(1000),
  alertWebhookUrl: z.string().url().optional(),
});

/**
 * Multi-Oracle Configuration Schema
 */
const MultiOracleSchema = z.object({
  mode: z.enum(['single', 'multi']).default('single'),
  enabled: z.boolean().default(false),
  localOracleId: z.string().optional(),
  registry: z.string().optional(),
  peers: z.string().optional(),
  secrets: z.string().optional(),
  threshold: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(10000),
});

/**
 * Supabase Configuration Schema
 */
const SupabaseSchema = z.object({
  url: z.string().url(),
  serviceRoleKey: z.string().min(1),
  anonKey: z.string().optional(),
});

/**
 * Alerting Configuration Schema
 */
const AlertingSchema = z.object({
  provider: z.enum(['none', 'pagerduty', 'opsgenie']).default('none'),
  pagerdutyRoutingKey: z.string().optional(),
  opsgenieApiKey: z.string().optional(),
}).refine(
  (data) => {
    if (data.provider === 'pagerduty') {
      return !!data.pagerdutyRoutingKey;
    }
    if (data.provider === 'opsgenie') {
      return !!data.opsgenieApiKey;
    }
    return true;
  },
  {
    message: 'Provider-specific credentials are required',
  },
);

/**
 * Heartbeat Configuration Schema
 */
const HeartbeatSchema = z.object({
  intervalMs: z.number().int().positive().default(3600000), // 1 hour
  alertTimeoutMs: z.number().int().positive().default(90000), // 90 seconds
});

/**
 * Event Listener Configuration Schema
 */
const EventListenerSchema = z.object({
  initialRetryDelayMs: z.number().int().positive().default(1000),
  maxRetryDelayMs: z.number().int().positive().default(60000),
  drawRequestReplay: z.boolean().default(false),
});

/**
 * Logging Configuration Schema
 */
const LoggingSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  dir: z.string().default('./logs'),
  toConsole: z.boolean().default(true),
  maxSize: z.string().default('20m'),
  maxFiles: z.string().default('14d'),
  zippedArchive: z.boolean().default(true),
});

/**
 * Server Configuration Schema
 */
const ServerSchema = z.object({
  port: z.number().int().positive().default(3003),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

/**
 * Complete Oracle Configuration Schema
 */
export const OracleConfigSchema = z.object({
  server: ServerSchema,
  stellar: StellarNetworkSchema,
  keyProvider: KeyProviderSchema,
  queue: QueueConfigSchema,
  vrf: VrfConfigSchema,
  circuitBreaker: CircuitBreakerSchema,
  priorityQueue: PriorityQueueSchema,
  fee: FeeConfigSchema,
  txSubmission: TxSubmissionSchema,
  multiOracle: MultiOracleSchema,
  supabase: SupabaseSchema.optional(),
  alerting: AlertingSchema,
  heartbeat: HeartbeatSchema,
  eventListener: EventListenerSchema,
  logging: LoggingSchema,
});

export type OracleConfig = z.infer<typeof OracleConfigSchema>;
export type StellarNetworkConfig = z.infer<typeof StellarNetworkSchema>;
export type KeyProviderConfig = z.infer<typeof KeyProviderSchema>;
export type QueueConfig = z.infer<typeof QueueConfigSchema>;
export type VrfConfig = z.infer<typeof VrfConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerSchema>;
export type PriorityQueueConfig = z.infer<typeof PriorityQueueSchema>;
export type FeeConfig = z.infer<typeof FeeConfigSchema>;
export type TxSubmissionConfig = z.infer<typeof TxSubmissionSchema>;
export type MultiOracleConfig = z.infer<typeof MultiOracleSchema>;
export type SupabaseConfig = z.infer<typeof SupabaseSchema>;
export type AlertingConfig = z.infer<typeof AlertingSchema>;
export type HeartbeatConfig = z.infer<typeof HeartbeatSchema>;
export type EventListenerConfig = z.infer<typeof EventListenerSchema>;
export type LoggingConfig = z.infer<typeof LoggingSchema>;
export type ServerConfig = z.infer<typeof ServerSchema>;

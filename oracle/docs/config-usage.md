# Oracle configuration usage

Worked examples for `OracleConfigService`. These snippets are documentation only. They are not compiled into the oracle.

Inject `OracleConfigService` and read one section at a time. Do not log private keys, service-role keys, or routing keys.

## Stellar connection

```typescript
const stellar = this.config.getStellar();
// stellar.horizonUrl, stellar.sorobanRpcUrl, stellar.raffleContractId, stellar.networkPassphrase
// stellar.sorobanRpcFallbackUrls is the fallback list
```

## Key provider

`getKeyProvider()` is a discriminated union. Only the `env` variant exposes `privateKey`, and that value must stay inside the key provider.

```typescript
const keyProvider = this.config.getKeyProvider();
switch (keyProvider.type) {
  case 'env':
    break;
  case 'aws-kms':
    // keyProvider.awsRegion, keyProvider.awsKeyId
    break;
  case 'gcp-kms':
    // keyProvider.gcpProjectId, keyProvider.gcpKeyRingId, keyProvider.gcpKeyId
    break;
}
```

## Queue

```typescript
const queue = this.config.getQueue();
const settings = {
  redis: { host: queue.redis.host, port: queue.redis.port },
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
```

## Randomness method and priority

```typescript
const method = prizeAmountXlm >= this.config.getVrf().thresholdXlm ? 'VRF' : 'PRNG';

const priority = this.config.getPriorityQueue();
const tier =
  prizeAmountXlm >= priority.highValueThresholdXlm ? 'HIGH'
  : prizeAmountXlm >= priority.medValueThresholdXlm ? 'MEDIUM'
  : 'LOW';
```

## Fees

```typescript
const fee = this.config.getFee();
let finalFee = Math.min(Math.max(estimatedFee, fee.minFeeStroops), fee.maxFeeStroops);
if (prizeAmountXlm < fee.lowStakesThresholdXlm) {
  finalFee = Math.min(finalFee, fee.minFeeStroops * 2);
}
```

## Circuit breaker

```typescript
const cb = this.config.getCircuitBreaker();
const open = consecutiveFailures >= cb.failureThreshold;
// When open, wait cb.resetTimeoutMs before the next attempt.
```

## Multi-oracle

```typescript
const multiOracle = this.config.getMultiOracle();
const enabled = multiOracle.mode === 'multi' || multiOracle.enabled;
const threshold = multiOracle.threshold || 1;
const localOracleId = multiOracle.localOracleId;
```

## Alerting

```typescript
const alerting = this.config.getAlerting();
// alerting.provider is 'pagerduty' | 'opsgenie' | 'none'
// Routing keys and API keys stay in the alerting service. Do not print them.
```

## Supabase audit log

```typescript
const supabase = this.config.getSupabase();
const auditEnabled = supabase !== undefined;
```

## Redacted configuration dump

```typescript
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

const redacted = {
  ...fullConfig,
  keyProvider: { type: fullConfig.keyProvider.type },
  supabase: fullConfig.supabase ? { url: fullConfig.supabase.url } : undefined,
  alerting: { provider: fullConfig.alerting.provider },
};
```

import { Networks } from '@stellar/stellar-sdk';
import { NetworkConfigError } from './network-config.error';
import {
  TikkaSdkErrorCode,
  RpcTimeoutError,
  RateLimitError,
  UnavailableError,
  ContractFailureError,
  TransactionRejectedError,
} from '../utils/errors';

export type TikkaNetwork = 'testnet' | 'mainnet' | 'standalone';

// ─── Retry & Backoff ───────────────────────────────────────────────────────────
//
// Retry is a first-class concern for the RPC services. Rather than every caller
// re-wrapping `RpcService` in their own retry loop, the policy is expressed as a
// `RetryConfig` (attempts, backoff, jitter, and a predicate that classifies
// failures) and consumed identically by the full (`network`) and light SDKs.

/**
 * Classification bucket a failure falls into, from the perspective of retrying.
 * - `retryable`        — transient; safe to retry the exact same request.
 * - `refresh-sequence` — recoverable, but only after the caller refreshes the
 *                        account sequence number (e.g. `TX_BAD_SEQ`).
 * - `fatal`            — never retry; the request itself is the problem.
 */
export type RetryFailureClass = 'retryable' | 'refresh-sequence' | 'fatal';

/** Outcome of running an error through the retry classifier. */
export interface RetryDecision {
  /** Whether the operation may be retried at all. */
  retry: boolean;
  /**
   * When true, the caller MUST refresh its account sequence number before the
   * next attempt. Only meaningful when `retry` is true.
   */
  refreshSequence?: boolean;
  /** Classification used for logging / observability. */
  reason?: RetryFailureClass;
  /** Optional human-readable note describing the classification. */
  message?: string;
}

/** Jitter strategies applied to the capped exponential backoff. */
export type RetryJitter = 'full' | 'equal' | number;

/** Detail passed to {@link RetryConfig.onRetry} before each wait. */
export interface RetryAttemptInfo {
  /** 1-based index of the attempt that just failed. */
  attempt: number;
  error: unknown;
  /** Milliseconds the loop will sleep before the next attempt. */
  delayMs: number;
  /** Classification of the failure that triggered this retry. */
  decision: RetryDecision;
}

/**
 * First-class retry / backoff policy for `RpcService`.
 *
 * Sane defaults are provided by {@link DEFAULT_RETRY_CONFIG}; a consumer only
 * overrides what it needs. The `classifyError` predicate is what decides
 * whether a given failure is retryable (and whether it needs a sequence
 * refresh), which keeps the retry loop unaware of Soroban-specific error shapes.
 */
export interface RetryConfig {
  /** Maximum attempts including the initial one (default: 3). */
  maxAttempts?: number;
  /** Initial backoff in ms; doubles each attempt (default: 300). */
  baseDelayMs?: number;
  /** Upper bound for a single backoff delay in ms (default: 8000). */
  maxDelayMs?: number;
  /**
   * Jitter applied to the capped backoff:
   * - `'full'`  delay = random(0, cap)               (default, see "full jitter")
   * - `'equal'` delay = cap/2 + random(0, cap/2)
   * - `number` j in [0,1] delay = cap*(1-j) + cap*j*random()
   */
  jitter?: RetryJitter;
  /**
   * Classifies an error into a {@link RetryDecision}. Defaults to
   * {@link classifySorobanRpcError}, which understands Soroban RPC failures.
   */
  classifyError?: (error: unknown) => RetryDecision;
  /** Invoked before each retry sleep (e.g. for logging). */
  onRetry?: (info: RetryAttemptInfo) => void;
}

export const SOROBAN_RPC_MAX_RETRIES = 3;
export const SOROBAN_RPC_BASE_DELAY_MS = 300;
export const SOROBAN_RPC_MAX_DELAY_MS = 8_000;

/**
 * Default retry policy. Classifies Soroban RPC failures so that TRY_AGAIN_LATER
 * and 5xx are retried, TX_BAD_SEQ is retried after a sequence refresh, and
 * malformed XDR is treated as fatal.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: SOROBAN_RPC_MAX_RETRIES,
  baseDelayMs: SOROBAN_RPC_BASE_DELAY_MS,
  maxDelayMs: SOROBAN_RPC_MAX_DELAY_MS,
  jitter: 'full',
  classifyError: classifySorobanRpcError,
};

/**
 * Classifies a Soroban RPC failure into a {@link RetryDecision}.
 *
 * Covers both the full SDK (which throws typed {@link TikkaSdkError} subclasses)
 * and the light SDK (which throws `TikkaSdkError` with a `code`), since both
 * embed the original RPC message/status, so the same logic applies to each.
 *
 * Decision matrix:
 * | Failure                              | Decision                   |
 * |--------------------------------------|----------------------------|
 * | TRY_AGAIN_LATER (Soroban)            | retryable                 |
 * | 5xx / 429                            | retryable                 |
 * | Transport errors (ECONNRESET, etc.)  | retryable                 |
 * | TX_BAD_SEQ                           | retryable + refreshSequence|
 * | Malformed XDR                        | fatal                     |
 * | Contract / validation failures       | fatal                     |
 * | Other 4xx                            | fatal                     |
 */
export function classifySorobanRpcError(error: unknown): RetryDecision {
  if (error === null || error === undefined) {
    return { retry: false, reason: 'fatal', message: 'Empty / undefined error' };
  }

  const err = error as any;
  const code: TikkaSdkErrorCode | string | undefined = err?.code;
  const status: number | undefined =
    err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.cause?.status;
  const message: string =
    typeof err?.message === 'string'
      ? err.message
      : typeof error === 'string'
        ? error
        : String(error);
  const lower = message.toLowerCase();

  // Malformed XDR is a request/encoding defect, never transient.
  if (/xdr/i.test(lower) && /(malformed|invalid|corrupt|unable to parse|could not (?:read|parse)|bad)/.test(lower)) {
    return { retry: false, reason: 'fatal', message: 'Malformed XDR — not retryable' };
  }

  // TX_BAD_SEQ — only recoverable after refreshing the account sequence number.
  // Checked before the contract-failure branch because the SDK wraps these
  // JSON-RPC errors as ContractFailureError, carrying the code in the message.
  if (
    code === TikkaSdkErrorCode.TransactionRejected ||
    /tx_bad_seq|txbadseq|badseq|bad sequence/i.test(lower)
  ) {
    return {
      retry: true,
      refreshSequence: true,
      reason: 'refresh-sequence',
      message: 'TX_BAD_SEQ — refresh account sequence before retrying',
    };
  }

  // TRY_AGAIN_LATER (Soroban) and timeline-out failures are transient.
  if (err instanceof RpcTimeoutError || /try_again_later|try again later/i.test(lower)) {
    return { retry: true, reason: 'retryable', message: 'TRY_AGAIN_LATER — transient' };
  }

  // Explicitly non-retryable contract / validation failures.
  if (
    code === TikkaSdkErrorCode.ContractFailure ||
    code === TikkaSdkErrorCode.SimulationFailed ||
    err instanceof ContractFailureError ||
    err instanceof TransactionRejectedError
  ) {
    return { retry: false, reason: 'fatal', message: 'Contract / validation failure — not retryable' };
  }

  // Rate limiting (429) and 5xx server errors are retryable.
  if (
    err instanceof RateLimitError ||
    err instanceof UnavailableError ||
    status === 429 ||
    (typeof status === 'number' && status >= 500 && status < 600)
  ) {
    return { retry: true, reason: 'retryable' };
  }

  // Transport / DNS / connection failures are retryable.
  if (
    ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EADDRINUSE', 'ETIMEDOUT'].includes(err?.code) ||
    /fetch failed|networkerror|network error/i.test(lower)
  ) {
    return { retry: true, reason: 'retryable' };
  }

  return { retry: false, reason: 'fatal' };
}

/**
 * Resolves the effective {@link RetryConfig} for an {@link RpcConfig}.
 *
 * Preference order:
 * 1. `rpcConfig.retry` (the first-class policy),
 * 2. the deprecated flat legacy fields (`maxRetryAttempts`, `retryBaseDelayMs`,
 *    `maxRetryDelayMs`),
 * 3. {@link DEFAULT_RETRY_CONFIG}.
 *
 * `hooks.onRetry` is merged on top so each RPC service can supply its own
 * logging without affecting the shared classification.
 */
export function buildRetryConfig(
  rpcConfig?: RpcConfig,
  hooks: { onRetry?: (info: RetryAttemptInfo) => void } = {},
): RetryConfig {
  const source: RetryConfig = rpcConfig?.retry
    ? rpcConfig.retry
    : {
        maxAttempts: rpcConfig?.maxRetryAttempts,
        baseDelayMs: rpcConfig?.retryBaseDelayMs,
        maxDelayMs: rpcConfig?.maxRetryDelayMs,
      };

  const config: RetryConfig = {
    maxAttempts: source.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
    baseDelayMs: source.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: source.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    jitter: source.jitter ?? DEFAULT_RETRY_CONFIG.jitter,
    classifyError: source.classifyError ?? DEFAULT_RETRY_CONFIG.classifyError,
  };

  if (hooks.onRetry) config.onRetry = hooks.onRetry;

  return config;
}

/**
 * High-level network configuration (used across SDK)
 */
export interface NetworkConfig {
  network: TikkaNetwork;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
}

/**
 * Low-level RPC configuration (customization layer)
 */
export interface RpcConfig {
  /** Primary RPC endpoint URL */
  endpoint?: string;
  /** Custom HTTP headers (e.g. API keys) */
  headers?: Record<string, string>;
  /** Ordered list of fallback endpoints */
  failoverEndpoints?: string[];
  /** Custom fetch-compatible client (e.g. node-fetch, undici) */
  fetchClient?: typeof fetch;
  /** Per-request timeout in ms (default: 30_000) */
  timeoutMs?: number;
  /** Enable retry strategy for transient errors */
  enableRetries?: boolean;
  /**
   * First-class retry / backoff policy. When provided, this takes precedence
   * over the legacy flat `maxRetryAttempts` / `retryBaseDelayMs` / `maxRetryDelayMs`
   * fields below (which are retained only for backwards compatibility).
   */
  retry?: RetryConfig;
  /** @deprecated use `retry.maxAttempts` */
  maxRetryAttempts?: number;
  /** @deprecated use `retry.baseDelayMs` */
  retryBaseDelayMs?: number;
  /** @deprecated unused — backoff factor is fixed at 2 in the retry loop */
  retryBackoffFactor?: number;
  /** @deprecated use `retry.maxDelayMs` */
  maxRetryDelayMs?: number;
  /** @deprecated superseded by the `retry.classifyError` predicate */
  retryableStatusCodes?: (number | string)[];
  /** Consecutive failures to trip the circuit breaker (default: 5) */
  circuitBreakerFailureThreshold?: number;
  /** Cooldown time in ms before transitioning from open to half-open (default: 10_000) */
  circuitBreakerResetTimeoutMs?: number;
}

export const SOROBAN_RPC_MAX_RETRIES = 3;
export const SOROBAN_RPC_BASE_DELAY_MS = 300;
export const SOROBAN_RPC_MAX_DELAY_MS = 8_000;

export const DEFAULT_RPC_CONFIG: RpcConfig = {
  headers: {},
  failoverEndpoints: [],
  timeoutMs: 30_000,
  enableRetries: true,
  maxRetryAttempts: SOROBAN_RPC_MAX_RETRIES,
  retryBaseDelayMs: SOROBAN_RPC_BASE_DELAY_MS,
  retryBackoffFactor: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504, 'RATE_LIMIT', 'UNAVAILABLE', 'TIMEOUT', 'ECONNRESET'],
  circuitBreakerFailureThreshold: 5,
  circuitBreakerResetTimeoutMs: 10_000,
};

const NETWORK_CONFIGS: Record<TikkaNetwork, NetworkConfig> = {
  testnet: {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
  },
  mainnet: {
    network: 'mainnet',
    rpcUrl: 'https://soroban.stellar.org',
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: Networks.PUBLIC,
  },
  standalone: {
    network: 'standalone',
    rpcUrl: 'http://localhost:8000/soroban/rpc',
    horizonUrl: 'http://localhost:8000',
    networkPassphrase: Networks.STANDALONE,
  },
};

/** Named presets, so most callers never hand-write a config (issue #1096). */
export const NETWORK_PRESETS = Object.freeze({ ...NETWORK_CONFIGS });

/** The network names accepted by `resolveNetworkConfig`. */
export const SUPPORTED_NETWORKS = Object.keys(NETWORK_CONFIGS) as TikkaNetwork[];

/** Passphrase each network must carry, keyed by name. */
const EXPECTED_PASSPHRASES: Record<TikkaNetwork, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  standalone: Networks.STANDALONE,
};

/**
 * Validate a fully-resolved network config (issue #1096).
 *
 * Runs at construction rather than at first request. A malformed RPC URL
 * previously surfaced as a fetch failure on the first call — far from the line
 * that actually caused it, and indistinguishable from the endpoint being down.
 *
 * Every failure names the offending field, so the message points at the fix.
 *
 * @throws {NetworkConfigError}
 */
export function validateNetworkConfig(config: NetworkConfig): NetworkConfig {
  if (!config || typeof config !== 'object') {
    throw new NetworkConfigError('config', config, 'must be an object');
  }

  if (!SUPPORTED_NETWORKS.includes(config.network)) {
    throw new NetworkConfigError(
      'network',
      config.network,
      `must be one of: ${SUPPORTED_NETWORKS.join(', ')}`,
    );
  }

  assertUrl('rpcUrl', config.rpcUrl);
  assertUrl('horizonUrl', config.horizonUrl);

  if (typeof config.networkPassphrase !== 'string' || config.networkPassphrase.trim() === '') {
    throw new NetworkConfigError('networkPassphrase', config.networkPassphrase, 'must be a non-empty string');
  }

  // A passphrase that does not match the named network is the dangerous case:
  // transactions sign against the passphrase, so a mainnet passphrase under a
  // "testnet" label produces signatures valid on mainnet. That must not be
  // reachable by a typo, and it is not something a first request would reveal.
  const expected = EXPECTED_PASSPHRASES[config.network];
  if (config.networkPassphrase !== expected) {
    throw new NetworkConfigError(
      'networkPassphrase',
      config.networkPassphrase,
      `does not match network "${config.network}" (expected: "${expected}")`,
    );
  }

  return config;
}

/** Assert a field is a syntactically valid http(s) URL. */
function assertUrl(field: string, value: unknown): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new NetworkConfigError(field, value, 'must be a non-empty string');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new NetworkConfigError(field, value, 'is not a valid URL');
  }

  // Anything other than http(s) cannot be fetched. Rejecting here is clearer
  // than letting the transport fail later with a protocol error.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new NetworkConfigError(field, value, 'must use http or https');
  }
}

/**
 * Resolves a NetworkConfig by name, or accepts a custom override.
 *
 * The result is validated before it is returned (issue #1096), so an invalid
 * config fails here rather than on the first request.
 *
 * @throws {NetworkConfigError}
 */
export function resolveNetworkConfig(
  networkOrConfig: TikkaNetwork | NetworkConfig | (Partial<NetworkConfig> & { network: TikkaNetwork }),
): NetworkConfig {
  if (typeof networkOrConfig === 'string') {
    const cfg = NETWORK_CONFIGS[networkOrConfig];
    if (!cfg) {
      throw new NetworkConfigError(
        'network',
        networkOrConfig,
        `must be one of: ${SUPPORTED_NETWORKS.join(', ')}`,
      );
    }
    // Presets are known-good, so this is a copy rather than a re-validation.
    return { ...cfg };
  }

  if (!networkOrConfig || typeof networkOrConfig !== 'object') {
    throw new NetworkConfigError('config', networkOrConfig, 'must be a network name or a config object');
  }

  const base = NETWORK_CONFIGS[networkOrConfig.network];
  if (!base) {
    throw new NetworkConfigError(
      'network',
      networkOrConfig.network,
      `must be one of: ${SUPPORTED_NETWORKS.join(', ')}`,
    );
  }

  // Overrides are validated: spreading user input over a preset is exactly how
  // a bad URL or a mismatched passphrase used to get through unnoticed.
  return validateNetworkConfig({ ...base, ...networkOrConfig });
}

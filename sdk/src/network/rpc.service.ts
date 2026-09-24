import { Injectable } from '@nestjs/common';
import { rpc, xdr } from '@stellar/stellar-sdk';
import { DEFAULT_RPC_CONFIG, buildRetryConfig } from './network.config';
import type { NetworkConfig, RpcConfig } from './network.config';
import { CircuitBreaker, type CircuitState } from './circuit-breaker';
import {
  TikkaSdkError,
  TikkaSdkErrorCode,
  NetworkError,
  RpcTimeoutError,
  RateLimitError,
  UnavailableError,
  InvalidResponseError,
  ContractFailureError,
} from '../utils/errors';
import { withRetry } from '../utils/retry';
import { defaultLogger, type TikkaLogger } from '../utils/logger';


interface RequestOptions {
  disableRetries?: boolean;
}

/**
 * RpcService
 * Combines Stellar RPC SDK with configurable transport (timeouts, headers, failover).
 */
@Injectable()
export class RpcService {
  private server: rpc.Server;
  private rpcConfig: RpcConfig;
  /** Shared, standalone circuit breaker (single source of truth across the monorepo). */
  private circuitBreaker: CircuitBreaker;

  constructor(
    private readonly networkConfig: NetworkConfig,
    rpcConfig?: RpcConfig,
    logger?: TikkaLogger,
  ) {
    this.logger = logger ?? defaultLogger;
    this.rpcConfig = this.normalizeConfig({
      ...DEFAULT_RPC_CONFIG,
      ...rpcConfig,
      endpoint: rpcConfig?.endpoint ?? networkConfig.rpcUrl,
    });

    this.circuitBreaker = this.createCircuitBreaker();

    this.server = new rpc.Server(networkConfig.rpcUrl, {
      allowHttp: networkConfig.rpcUrl.startsWith('http://'),
    });
  }

  /** Get underlying rpc.Server */
  getServer(): rpc.Server {
    return this.server;
  }

  /** Update RPC config at runtime */
  configure(config: Partial<RpcConfig>): void {
    this.rpcConfig = this.normalizeConfig({ ...this.rpcConfig, ...config });
    // Keep breaker tuning in sync without resetting its state.
    this.circuitBreaker.updateConfig({
      failureThreshold: this.rpcConfig.circuitBreakerFailureThreshold,
      resetTimeoutMs: this.rpcConfig.circuitBreakerResetTimeoutMs,
    });
  }

  private createCircuitBreaker(): CircuitBreaker {
    return new CircuitBreaker({
      failureThreshold: this.rpcConfig.circuitBreakerFailureThreshold ?? 5,
      resetTimeoutMs: this.rpcConfig.circuitBreakerResetTimeoutMs ?? 10_000,
      hooks: {
        onStateChange: (from, to) => {
          if (from === 'half-open' && to === 'open') {
            console.warn('[RpcService] Circuit breaker probe failed. Re-entered OPEN state.');
          } else if (from === 'half-open' && to === 'closed') {
            console.log('[RpcService] Circuit breaker recovered. State set to CLOSED.');
          }
        },
      },
    });
  }

  /** Override RPC endpoint */
  setEndpoint(url: string): void {
    this.rpcConfig.endpoint = url;
    this.server = new rpc.Server(url, {
      allowHttp: url.startsWith('http://'),
    });
  }

  /** Add fallback RPC endpoint */
  addFailoverEndpoint(url: string): void {
    if (!this.rpcConfig.failoverEndpoints) {
      this.rpcConfig.failoverEndpoints = [];
    }
    this.rpcConfig.failoverEndpoints.push(url);
  }

  /** Set custom fetch-compatible client */
  setFetchClient(client: any): void {
    this.rpcConfig.fetchClient = client;
  }

  /** Set default HTTP headers (e.g. API keys) */
  setHeaders(headers: Record<string, string>): void {
    this.rpcConfig.headers = { ...this.rpcConfig.headers, ...headers };
  }

  /** Simulate transaction with automatic failover */
  async simulateTransaction(
    tx: any,
    options: RequestOptions = {},
  ): Promise<rpc.Api.SimulateTransactionResponse> {
    return this.request('simulateTransaction', { transaction: tx.toXDR() }, options);
  }

  /** Send transaction with automatic failover */
  async sendTransaction(
    tx: any,
    options: RequestOptions = {},
  ): Promise<rpc.Api.SendTransactionResponse> {
    return this.request('sendTransaction', { transaction: tx.toXDR() }, options);
  }

  /** Fetch latest ledger from Soroban RPC */
  async getLedger(
    options: RequestOptions = {},
  ): Promise<rpc.Api.GetLatestLedgerResponse> {
    // getLatestLedger takes no params — omit rather than send []
    // (empty array is rejected by current Soroban RPC).
    return this.request('getLatestLedger', undefined, options);
  }

  /**
   * Get a single transaction status from the RPC node (single-shot).
   * Returns NOT_FOUND if the tx is not yet indexed — caller owns the retry loop.
   * Transient transport errors (429, 5xx) are still retried by `executeRequest()`.
   */
  async getTransaction(
    hash: string,
  ): Promise<rpc.Api.GetTransactionResponse> {
    return this.request('getTransaction', { hash });
  }

  /**
   * Estimate fee using Horizon's fee stats endpoint.
   */
  async estimateFee(_operation?: xdr.Operation): Promise<{ minFee: number; suggestedFee: number }> {
    const fetchClient = this.resolveFetchClient();
    try {
      const response = await fetchClient(`${this.networkConfig.horizonUrl}/fee_stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch fee stats: ${response.statusText}`);
      }
      const stats = await response.json();
      return {
        minFee: Number(stats.fee_charged?.min ?? 100),
        suggestedFee: Number(stats.fee_charged?.p90 ?? 100),
      };
    } catch (err: any) {
      this.logger.warn(`[RpcService] estimateFee failed, falling back to 100 stroops: ${err.message}`);
      return { minFee: 100, suggestedFee: 100 };
    }
  }

  /** Get the current state of the circuit breaker */
  getCircuitState(): CircuitState {
    // Lazily reflect the half-open probe window on read, matching the
    // previous behavior where an expired open breaker surfaced as half-open.
    this.circuitBreaker.refresh();
    return this.circuitBreaker.getState();
  }

  /**
   * Returns true if the service is operating in a degraded mode:
   * - Circuit breaker is open or half-open, OR
   * - Currently experiencing consecutive failures (> 0)
   */
  isDegraded(): boolean {
    return this.getCircuitState() !== 'closed' || this.circuitBreaker.getFailureCount() > 0;
  }

  private checkCircuitBreaker(): void {
    if (this.circuitBreaker.canAttempt()) {
      return;
    }
    const remainingMs = this.circuitBreaker.getRemainingCooldownMs();
    throw new UnavailableError(
      `Circuit breaker is OPEN. Request blocked. Cooldown remaining: ${remainingMs}ms`,
      { remainingMs }
    );
  }

  private recordSuccess(): void {
    this.circuitBreaker.recordSuccess();
  }

  private recordFailure(error: any): void {
    const isInfraError =
      error instanceof RpcTimeoutError ||
      error instanceof RateLimitError ||
      error instanceof UnavailableError ||
      error?.code === TikkaSdkErrorCode.NetworkError ||
      error?.code === TikkaSdkErrorCode.Timeout;

    if (!isInfraError) {
      return;
    }

    this.circuitBreaker.recordFailure();
    if (this.circuitBreaker.getState() === 'open') {
      console.warn(
        `[RpcService] Circuit breaker tripped to OPEN after ${this.circuitBreaker.getFailureCount()} consecutive failures.`
      );
    }
  }

  /**
   * Internal request handler with automatic failover and custom transport.
   * `params` should be a JSON-RPC object (or omitted for param-less methods).
   */
  private async request<T>(
    method: string,
    params?: Record<string, unknown>,
    options: RequestOptions = {},
  ): Promise<T> {
    this.checkCircuitBreaker();

    const endpoints = [
      this.rpcConfig.endpoint ?? this.networkConfig.rpcUrl,
      ...(this.rpcConfig.failoverEndpoints || []),
    ];
    let lastError: any = null;

    for (const url of endpoints) {
      try {
        const result = await this.executeRequest<T>(url, method, params, options);
        this.recordSuccess();
        return result;
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    this.recordFailure(lastError);

    if (lastError instanceof TikkaSdkError) throw lastError;
    throw new NetworkError(
      `RPC request failed for all endpoints. Last error: ${lastError?.message ?? lastError}`,
      lastError
    );
  }

  private async executeRequest<T>(
    url: string,
    method: string,
    params: Record<string, unknown> | undefined,
    options: RequestOptions = {},
  ): Promise<T> {
    const retriesEnabled = this.rpcConfig.enableRetries !== false && !options.disableRetries;
    
    if (!retriesEnabled) {
      return this.executeSingleRequest<T>(url, method, params);
    }

    return withRetry(
      () => this.executeSingleRequest<T>(url, method, params),
      buildRetryConfig(this.rpcConfig, {
        onRetry: (info) => {
          console.warn(
            `[RpcService] ${method} retry ${info.attempt} in ${Math.round(info.delayMs)}ms (${url}): ${
              info.error instanceof Error ? info.error.message : String(info.error)
            }`,
          );
        },
      }),
    );
  }

  private async executeSingleRequest<T>(
    url: string,
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<T> {
    const fetchClient = this.resolveFetchClient();
    const timeoutMs = this.rpcConfig.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload: Record<string, unknown> = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
      };
      // Omit params for methods that take none (e.g. getLatestLedger).
      // Empty arrays are rejected by current Soroban RPC ("invalid parameters").
      if (params !== undefined) {
        payload.params = params;
      }

      const response = await fetchClient(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.rpcConfig.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new RateLimitError(`Rate limit exceeded: ${response.statusText}`, { status: 429 });
        }
        if ([502, 503, 504].includes(response.status)) {
          throw new UnavailableError(`Service unavailable: ${response.statusText}`, { status: response.status });
        }
        throw new InvalidResponseError(`RPC request failed: ${response.statusText}`, { status: response.status });
      }

      let responsePayload: any;
      try {
        responsePayload = await response.json();
      } catch (err: any) {
        throw new InvalidResponseError('Failed to parse RPC response as JSON', err);
      }

      if (!responsePayload || (responsePayload.result === undefined && responsePayload.error === undefined)) {
        throw new InvalidResponseError('Malformed RPC response: missing both result and error fields', responsePayload);
      }

      if (responsePayload.error) {
        const errorMsg = responsePayload.error.message || 'Unknown RPC error';
        const isContractErr = errorMsg.includes('ContractError') || errorMsg.includes('HostValidationError') || responsePayload.error.code === -32603;
        if (isContractErr) {
          throw new ContractFailureError(`Contract execution failed: ${errorMsg}`, responsePayload.error);
        } else {
          throw new ContractFailureError(`RPC execution failed: ${errorMsg}`, responsePayload.error);
        }
      }

      return responsePayload.result as T;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        throw new RpcTimeoutError(`Request timed out after ${timeoutMs}ms`, error);
      }

      if (
        error instanceof RateLimitError ||
        error instanceof UnavailableError ||
        error instanceof InvalidResponseError ||
        error instanceof ContractFailureError ||
        error instanceof RpcTimeoutError
      ) {
        throw error;
      }

      const isSystemNetworkError = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EADDRINUSE'].includes(error.code) ||
        error.message?.includes('fetch failed') ||
        error.message?.includes('NetworkError');

      if (isSystemNetworkError) {
        throw new UnavailableError(`RPC network connection failed: ${error.message}`, error);
      }

      throw new UnavailableError(`RPC request failed: ${error.message}`, error);
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveFetchClient(): typeof fetch {
    if (this.rpcConfig.fetchClient) return this.rpcConfig.fetchClient;
    const runtimeFetch = (globalThis as any).fetch;
    if (typeof runtimeFetch === 'function') {
      return runtimeFetch;
    }
    throw new NetworkError(
      'No fetch implementation found. Provide rpcConfig.fetchClient (required in some React Native and older Node runtimes).',
    );
  }

  private normalizeConfig(config: RpcConfig): RpcConfig {
    return {
      ...config,
      failoverEndpoints: [...(config.failoverEndpoints ?? [])],
      retryableStatusCodes: [...(config.retryableStatusCodes ?? [])],
    };
  }
}
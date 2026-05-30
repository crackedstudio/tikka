import { Injectable } from '@nestjs/common';
import { rpc, xdr } from '@stellar/stellar-sdk';
import { DEFAULT_RPC_CONFIG } from './network.config';
import type { NetworkConfig, RpcConfig } from './network.config';
import {
  TikkaSdkError,
  TikkaSdkErrorCode,
  RpcTimeoutError,
  RateLimitError,
  UnavailableError,
  InvalidResponseError,
  ContractFailureError,
} from '../utils/errors';
import { withRetry } from '../utils/retry';


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
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private consecutiveFailures = 0;
  private circuitOpenedAt: number | null = null;

  constructor(
    private readonly networkConfig: NetworkConfig,
    rpcConfig?: RpcConfig,
  ) {
    this.rpcConfig = this.normalizeConfig({
      ...DEFAULT_RPC_CONFIG,
      ...rpcConfig,
      endpoint: rpcConfig?.endpoint ?? networkConfig.rpcUrl,
    });

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
    return this.request('simulateTransaction', [tx.toXDR()], options);
  }

  /** Send transaction with automatic failover */
  async sendTransaction(
    tx: any,
    options: RequestOptions = {},
  ): Promise<rpc.Api.SendTransactionResponse> {
    return this.request('sendTransaction', [tx.toXDR()], options);
  }

  /** Fetch latest ledger from Soroban RPC */
  async getLedger(
    options: RequestOptions = {},
  ): Promise<rpc.Api.GetLatestLedgerResponse> {
    return this.request('getLatestLedger', [], options);
  }

  /**
   * Get a single transaction status from the RPC node (single-shot).
   * Returns NOT_FOUND if the tx is not yet indexed — caller owns the retry loop.
   * Transient transport errors (429, 5xx) are still retried by `executeRequest()`.
   */
  async getTransaction(
    hash: string,
  ): Promise<rpc.Api.GetTransactionResponse> {
    return this.request('getTransaction', [hash]);
  }

  /**
   * Estimate fee using Horizon's fee stats endpoint.
   */
  async estimateFee(operation?: xdr.Operation): Promise<{ minFee: number; suggestedFee: number }> {
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
      console.warn(`[RpcService] estimateFee failed, falling back to 100 stroops: ${err.message}`);
      return { minFee: 100, suggestedFee: 100 };
    }
  }

  /** Get the current state of the circuit breaker */
  getCircuitState(): 'closed' | 'open' | 'half-open' {
    if (this.circuitState === 'open') {
      const resetTimeout = this.rpcConfig.circuitBreakerResetTimeoutMs ?? 10_000;
      const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
      if (elapsed >= resetTimeout) {
        this.circuitState = 'half-open';
      }
    }
    return this.circuitState;
  }

  /**
   * Returns true if the service is operating in a degraded mode:
   * - Circuit breaker is open or half-open, OR
   * - Currently experiencing consecutive failures (> 0)
   */
  isDegraded(): boolean {
    return this.getCircuitState() !== 'closed' || this.consecutiveFailures > 0;
  }

  private checkCircuitBreaker(): void {
    const state = this.getCircuitState();
    if (state === 'open') {
      const resetTimeout = this.rpcConfig.circuitBreakerResetTimeoutMs ?? 10_000;
      const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
      const remaining = resetTimeout - elapsed;
      throw new UnavailableError(
        `Circuit breaker is OPEN. Request blocked. Cooldown remaining: ${remaining > 0 ? remaining : 0}ms`,
        { remainingMs: remaining > 0 ? remaining : 0 }
      );
    }
  }

  private recordSuccess(): void {
    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed';
      console.log(`[RpcService] Circuit breaker recovered. State set to CLOSED.`);
    }
    this.consecutiveFailures = 0;
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

    const threshold = this.rpcConfig.circuitBreakerFailureThreshold ?? 5;

    if (this.circuitState === 'closed') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= threshold) {
        this.circuitState = 'open';
        this.circuitOpenedAt = Date.now();
        console.warn(
          `[RpcService] Circuit breaker tripped to OPEN after ${this.consecutiveFailures} consecutive failures.`
        );
      }
    } else if (this.circuitState === 'half-open') {
      this.circuitState = 'open';
      this.circuitOpenedAt = Date.now();
      console.warn(`[RpcService] Circuit breaker probe failed. Re-entered OPEN state.`);
    }
  }

  /**
   * Internal request handler with automatic failover and custom transport.
   */
  private async request<T>(
    method: string,
    params: any[] = [],
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
    throw new TikkaSdkError(
      TikkaSdkErrorCode.NetworkError,
      `RPC request failed for all endpoints. Last error: ${lastError?.message ?? lastError}`,
      lastError
    );
  }

  private async executeRequest<T>(
    url: string,
    method: string,
    params: any[],
    options: RequestOptions = {},
  ): Promise<T> {
    const retriesEnabled = this.rpcConfig.enableRetries !== false && !options.disableRetries;
    
    if (!retriesEnabled) {
      return this.executeSingleRequest<T>(url, method, params);
    }

    return withRetry(
      () => this.executeSingleRequest<T>(url, method, params),
      {
        maxAttempts: this.rpcConfig.maxRetryAttempts ?? 3,
        baseDelayMs: this.rpcConfig.retryBaseDelayMs ?? 500,
        maxDelayMs: this.rpcConfig.maxRetryDelayMs ?? 8000,
        retryOn: this.rpcConfig.retryableStatusCodes ?? [429, 502, 503, 504, 'RATE_LIMIT', 'UNAVAILABLE', 'TIMEOUT', 'ECONNRESET'],
        onRetry: (attempt, error, delay) => {
          console.warn(
            `[RpcService] ${method} retry ${attempt} in ${Math.round(delay)}ms (${url}): ${error?.message ?? error}`,
          );
        },
      },
    );
  }

  private async executeSingleRequest<T>(
    url: string,
    method: string,
    params: any[],
  ): Promise<T> {
    const fetchClient = this.resolveFetchClient();
    const timeoutMs = this.rpcConfig.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchClient(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.rpcConfig.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
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

      let payload: any;
      try {
        payload = await response.json();
      } catch (err: any) {
        throw new InvalidResponseError('Failed to parse RPC response as JSON', err);
      }

      if (!payload || (payload.result === undefined && payload.error === undefined)) {
        throw new InvalidResponseError('Malformed RPC response: missing both result and error fields', payload);
      }

      if (payload.error) {
        const errorMsg = payload.error.message || 'Unknown RPC error';
        const isContractErr = errorMsg.includes('ContractError') || errorMsg.includes('HostValidationError') || payload.error.code === -32603;
        if (isContractErr) {
          throw new ContractFailureError(`Contract execution failed: ${errorMsg}`, payload.error);
        } else {
          throw new ContractFailureError(`RPC execution failed: ${errorMsg}`, payload.error);
        }
      }

      return payload.result as T;
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
    throw new TikkaSdkError(
      TikkaSdkErrorCode.NetworkError,
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
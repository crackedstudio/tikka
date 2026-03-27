import { Injectable } from '@nestjs/common';
import { rpc } from '@stellar/stellar-sdk';
import { NetworkConfig, RpcConfig, DEFAULT_RPC_CONFIG } from './network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

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

  constructor(
    private readonly networkConfig: NetworkConfig,
    rpcConfig?: RpcConfig,
  ) {
    this.rpcConfig = this.normalizeConfig({ ...DEFAULT_RPC_CONFIG, ...rpcConfig });

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

  /** Poll transaction status */
  async getTransaction(
    hash: string,
    timeoutMs = this.rpcConfig.timeoutMs ?? 30_000,
    intervalMs = 2_000,
  ): Promise<rpc.Api.GetTransactionResponse> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const resp = await this.request<rpc.Api.GetTransactionResponse>('getTransaction', [hash]);
        if (resp.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
          return resp;
        }
      } catch {
        // If it's a transport error, we might want to failover inside request()
        // so we don't need extra logic here.
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new TikkaSdkError(
      TikkaSdkErrorCode.Timeout,
      `Transaction ${hash} not confirmed within ${timeoutMs}ms`,
    );
  }

  /**
   * Internal request handler with automatic failover and custom transport.
   */
  private async request<T>(
    method: string,
    params: any[] = [],
    options: RequestOptions = {},
  ): Promise<T> {
    const endpoints = [this.rpcConfig.endpoint, ...(this.rpcConfig.failoverEndpoints || [])];
    let lastError: any = null;

    for (const url of endpoints) {
      try {
        return await this.executeRequest<T>(url, method, params, options);
      } catch (error) {
        lastError = error;
        continue;
      }
    }

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
    const maxAttempts = retriesEnabled ? Math.max(1, this.rpcConfig.maxRetryAttempts ?? 3) : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.executeSingleRequest<T>(url, method, params);
        if (attempt > 1) {
          console.info(`[RpcService] ${method} succeeded on retry ${attempt}/${maxAttempts} (${url})`);
        }
        return result;
      } catch (error: any) {
        lastError = error;
        const shouldRetry = attempt < maxAttempts && this.shouldRetry(error);

        if (!shouldRetry) {
          break;
        }

        const delay = Math.round(
          (this.rpcConfig.retryBaseDelayMs ?? 300) *
          Math.pow(this.rpcConfig.retryBackoffFactor ?? 2, attempt - 1),
        );
        console.warn(
          `[RpcService] ${method} retry ${attempt}/${maxAttempts} in ${delay}ms (${url}): ${error?.message ?? error}`,
        );
        await this.sleep(delay);
      }
    }

    console.error(`[RpcService] ${method} failed after ${maxAttempts} attempt(s) (${url})`);
    throw lastError;
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
        throw new TikkaSdkError(
          TikkaSdkErrorCode.NetworkError,
          `RPC request failed: ${response.statusText}`,
          { status: response.status },
        );
      }

      const payload = await response.json();
      if (payload.error) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.SimulationFailed,
          payload.error.message || 'Unknown RPC error',
          payload.error,
        );
      }

      return payload.result as T;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.Timeout,
          `Request timed out after ${timeoutMs}ms`,
          error,
        );
      }
      throw error;
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

  private shouldRetry(error: any): boolean {
    if (error?.code === TikkaSdkErrorCode.Timeout) return true;
    const status = error?.cause?.status ?? error?.status;
    if (typeof status === 'number') {
      return (this.rpcConfig.retryableStatusCodes ?? []).includes(status);
    }
    return error?.code === TikkaSdkErrorCode.NetworkError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeConfig(config: RpcConfig): RpcConfig {
    return {
      ...config,
      failoverEndpoints: [...(config.failoverEndpoints ?? [])],
      retryableStatusCodes: [...(config.retryableStatusCodes ?? [])],
    };
  }
}
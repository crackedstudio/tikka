import { Injectable } from '@nestjs/common';
import { rpc } from '@stellar/stellar-sdk';
import { NetworkConfig, RpcConfig, DEFAULT_RPC_CONFIG } from './network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

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
    this.rpcConfig = { ...DEFAULT_RPC_CONFIG, ...rpcConfig };

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
    this.rpcConfig = { ...this.rpcConfig, ...config };
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

  /** Simulate transaction with automatic failover */
  async simulateTransaction(
    tx: any,
  ): Promise<rpc.Api.SimulateTransactionResponse> {
    return this.request('simulateTransaction', [tx.toXDR()]);
  }

  /** Send transaction with automatic failover */
  async sendTransaction(
    tx: any,
  ): Promise<rpc.Api.SendTransactionResponse> {
    return this.request('sendTransaction', [tx.toXDR()]);
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
      } catch (err) {
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
  private async request<T>(method: string, params: any[] = []): Promise<T> {
    const endpoints = [this.rpcConfig.endpoint, ...(this.rpcConfig.failoverEndpoints || [])];
    let lastError: any = null;

    for (const url of endpoints) {
      try {
        return await this.executeRequest<T>(url, method, params);
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
  ): Promise<T> {
    const fetchClient = this.rpcConfig.fetchClient || fetch;
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
          { status: response.status }
        );
      }

      const payload = await response.json();
      if (payload.error) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.SimulationFailed, // Generic for RPC errors
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
          error
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
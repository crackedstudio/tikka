import { Injectable, Optional } from '@nestjs/common';
import { RpcConfig, DEFAULT_RPC_CONFIG } from './network.config';
import { RpcError } from '../utils/errors';

@Injectable()
export class RpcService {
  private config: RpcConfig;

  constructor(@Optional() config?: RpcConfig) {
    this.config = { ...DEFAULT_RPC_CONFIG, ...config };
  }

  /**
   * Updates the service configuration at runtime
   */
  configure(config: Partial<RpcConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Overrides the primary RPC endpoint
   */
  setEndpoint(url: string): void {
    this.config.endpoint = url;
  }

  /**
   * Adds a fallback endpoint to the failover list
   */
  addFailoverEndpoint(url: string): void {
    if (!this.config.failoverEndpoints) {
      this.config.failoverEndpoints = [];
    }
    this.config.failoverEndpoints.push(url);
  }

  /**
   * Sets custom HTTP headers (e.g. API keys)
   */
  setHeaders(headers: Record<string, string>): void {
    this.config.headers = { ...this.config.headers, ...headers };
  }

  /**
   * Swaps the fetch-compatible client used for requests
   */
  setFetchClient(client: typeof fetch): void {
    this.config.fetchClient = client;
  }

  /**
   * Executes a JSON-RPC request with automatic failover
   */
  async request<T>(method: string, params: any[] = []): Promise<T> {
    const endpoints = [this.config.endpoint, ...(this.config.failoverEndpoints || [])];
    let lastError: Error | null = null;

    for (const url of endpoints) {
      try {
        return await this.executeRequest<T>(url, method, params);
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('RPC request failed: No endpoints configured');
  }

  private async executeRequest<T>(
    url: string,
    method: string,
    params: any[],
  ): Promise<T> {
    const fetchClient = this.config.fetchClient || fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetchClient(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
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
        throw RpcError.fromResponse(url, method, response);
      }

      const payload = await response.json();
      if (payload.error) {
        throw new RpcError(
          payload.error.message || 'Unknown RPC error',
          url,
          method,
          response.status,
          payload.error,
        );
      }

      return payload.result as T;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new RpcError(`Request timed out after ${this.config.timeoutMs}ms`, url, method);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

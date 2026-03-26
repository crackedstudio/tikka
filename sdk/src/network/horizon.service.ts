import { Injectable, Optional } from '@nestjs/common';
import { RpcConfig, DEFAULT_RPC_CONFIG } from './network.config';

@Injectable()
export class HorizonService {
  private config: RpcConfig;

  constructor(@Optional() config?: RpcConfig) {
    this.config = { ...DEFAULT_RPC_CONFIG, ...config };
  }

  configure(config: Partial<RpcConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Note: Horizon uses REST/GET/POST instead of JSON-RPC, 
   * but we share the config pattern for consistency.
   */
  async get<T>(path: string): Promise<T> {
    const fetchClient = this.config.fetchClient || fetch;
    const url = `${this.config.endpoint}${path}`;
    
    const response = await fetchClient(url, {
      headers: this.config.headers,
    });

    if (!response.ok) {
      throw new Error(`Horizon request failed: ${response.statusText}`);
    }

    return response.json();
  }
}

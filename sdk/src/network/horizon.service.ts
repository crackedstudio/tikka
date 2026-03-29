import { Injectable } from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { NetworkConfig } from './network.config';

/**
 * HorizonService
 * Wrapper around Stellar Horizon SDK for account + network queries.
 */
@Injectable()
export class HorizonService {
  private server: Horizon.Server;

  constructor(private readonly config: NetworkConfig) {
    this.server = new Horizon.Server(config.horizonUrl, {
      allowHttp: config.horizonUrl.startsWith('http://'),
    });
  }

  /** Get raw Horizon server instance (advanced use cases) */
  getServer(): Horizon.Server {
    return this.server;
  }

  /** Load an account (required for building transactions) */
  async loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    return this.server.loadAccount(publicKey);
  }

  /** Get current base fee from network */
  async getBaseFee(): Promise<number> {
    const stats = await this.server.feeStats();
    return Number(stats.last_ledger_base_fee);
  }
}
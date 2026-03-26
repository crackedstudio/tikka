import { Injectable } from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { NetworkConfig } from './network.config';

/**
 * Thin wrapper around the Horizon client.
 * Used for account lookup, fee stats, and ledger queries.
 */
@Injectable()
export class HorizonService {
  private server: Horizon.Server;

  constructor(private readonly config: NetworkConfig) {
    this.server = new Horizon.Server(config.horizonUrl, {
      allowHttp: config.horizonUrl.startsWith('http://'),
    });
  }

  getServer(): Horizon.Server {
    return this.server;
  }

  /** Load an account (needed to build transactions). */
  async loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    return this.server.loadAccount(publicKey);
  }

  /** Get recent base fee. */
  async getBaseFee(): Promise<number> {
    const stats = await this.server.feeStats();
    return Number(stats.last_ledger_base_fee);
  }
}

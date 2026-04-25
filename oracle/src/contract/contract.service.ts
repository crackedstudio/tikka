import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';

export interface RaffleData {
  raffleId: number;
  prizeAmount: number;
  status: string;
}

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);
  private readonly rpcServer: StellarSdk.rpc.Server;
  private readonly contractId: string;
  private readonly networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
    this.networkPassphrase = this.configService.get<string>('NETWORK_PASSPHRASE', StellarSdk.Networks.TESTNET);
    this.contractId = this.configService.get<string>('RAFFLE_CONTRACT_ID', '');
    
    this.rpcServer = new StellarSdk.rpc.Server(rpcUrl);

    if (!this.contractId) {
      this.logger.warn('RAFFLE_CONTRACT_ID is not set. ContractService calls will fail.');
    }
  }

  /**
   * Fetches raffle data from the Soroban contract
   * @param raffleId The raffle ID
   * @returns Raffle data including prize amount
   */
  async getRaffleData(raffleId: number): Promise<RaffleData> {
    if (!this.contractId) {
      throw new Error('RAFFLE_CONTRACT_ID is not configured');
    }

    try {
      this.logger.debug(`Fetching raffle data for ID: ${raffleId}`);

      // Create a dummy source account for simulation
      const sourceAccount = new StellarSdk.Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
      const contract = new StellarSdk.Contract(this.contractId);

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('get_raffle_data', StellarSdk.xdr.ScVal.scvU32(raffleId >>> 0)))
        .setTimeout(30)
        .build();

      const simulated = await this.rpcServer.simulateTransaction(tx);

      if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
        throw new Error(`Simulation failed: ${JSON.stringify(simulated.error)}`);
      }

      if (!simulated.result) {
        throw new Error('Simulation returned no result');
      }

      const resultValue = simulated.result.retval;
      const data = this.decodeScVal(resultValue);

      if (!data || typeof data !== 'object') {
        throw new Error('Failed to decode raffle data from contract response');
      }

      return {
        raffleId: Number(data.raffle_id ?? raffleId),
        prizeAmount: Number(data.prize_amount ?? 0),
        status: String(data.status ?? 'UNKNOWN'),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch raffle data for ${raffleId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Checks if randomness has already been submitted for this raffle
   * @param raffleId The raffle ID
   * @returns True if already finalized
   */
  async isRandomnessSubmitted(raffleId: number): Promise<boolean> {
    try {
      const data = await this.getRaffleData(raffleId);
      return data.status === 'FINALIZED' || data.status === 'CANCELLED';
    } catch (error) {
      // If we can't fetch data, we assume it's safer to retry or log error
      this.logger.error(`Could not determine if randomness is submitted for raffle ${raffleId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Pings the Soroban contract to inform the ecosystem that the oracle is alive
   */
  async ping(): Promise<void> {
    if (!this.contractId) return;

    try {
      this.logger.log('Sending oracle heartbeat (ping) to contract...');
      // Note: Ping is usually a write operation, so it requires a real account and signing.
      // For this MVP, we might just use it to check RPC health.
      await this.rpcServer.getLatestLedger();
    } catch (error: any) {
      this.logger.error(`Oracle ping failed: ${error.message}`);
    }
  }

  /**
   * Helper to decode ScVal into JS types
   */
  private decodeScVal(val: StellarSdk.xdr.ScVal): any {
    switch (val.switch()) {
      case StellarSdk.xdr.ScValType.scvU32(): return val.u32();
      case StellarSdk.xdr.ScValType.scvU64(): return val.u64().toString();
      case StellarSdk.xdr.ScValType.scvI32(): return val.i32();
      case StellarSdk.xdr.ScValType.scvI64(): return val.i64().toString();
      case StellarSdk.xdr.ScValType.scvSymbol(): return val.sym().toString();
      case StellarSdk.xdr.ScValType.scvString(): return val.str().toString();
      case StellarSdk.xdr.ScValType.scvBytes(): return val.bytes().toString('hex');
      case StellarSdk.xdr.ScValType.scvAddress():
        const addr = val.address();
        if (addr.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeAccount()) {
          return StellarSdk.Address.account(Buffer.from(addr.accountId().ed25519() as any)).toString();
        } else {
          return StellarSdk.Address.contract(Buffer.from(addr.contractId() as any)).toString();
        }
      case StellarSdk.xdr.ScValType.scvBool(): return val.b();
      case StellarSdk.xdr.ScValType.scvMap():
        const result: Record<string, any> = {};
        for (const entry of val.map() ?? []) {
          const key = entry.key().sym().toString();
          result[key] = this.decodeScVal(entry.val());
        }
        return result;
      case StellarSdk.xdr.ScValType.scvVec():
        return (val.vec() ?? []).map(v => this.decodeScVal(v));
      default: return null;
    }
  }
}

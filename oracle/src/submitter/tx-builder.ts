import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';
import { ContractBuilders } from '../contract/contract.builders';
import { KeyService } from '../keys/key.service';

@Injectable()
export class TxBuilderService {
  constructor(
    private readonly logger: OracleLoggerService,
    private readonly keyService: KeyService,
  ) {}

  public async buildPreparedTx(
    rpcServer: any,
    contractId: string,
    networkPassphrase: string,
    sourceAddress: string,
    raffleId: number,
    randomness: RandomnessResult,
    feeStroops: number,
  ) {
    const account = await rpcServer.getAccount(sourceAddress);
    const fee = (Number((StellarSdk as any).BASE_FEE || 100) * feeStroops).toString();

    const contract = new (StellarSdk as any).Contract(contractId);
    const inv = ContractBuilders.buildReceiveRandomness(raffleId, randomness);

    const tx = new (StellarSdk as any).TransactionBuilder(account, {
      fee,
      networkPassphrase,
    })
      .addOperation(contract.call(inv.method, ...inv.args))
      .setTimeout(30)
      .build();

    const simulated = await rpcServer.simulateTransaction(tx);
    if (simulated?.error || simulated?.restorePreamble?.error) {
      this.logger.warn(`Simulation returned an error: ${JSON.stringify(simulated)}`);
    }

    return rpcServer.prepareTransaction(tx);
  }

  public async buildCommitmentTx(
    rpcServer: any,
    contractId: string,
    networkPassphrase: string,
    sourceAddress: string,
    raffleId: number,
    commitment: string,
    feeStroops: number,
  ) {
    const account = await rpcServer.getAccount(sourceAddress);
    const fee = (Number((StellarSdk as any).BASE_FEE || 100) * feeStroops).toString();
    const contract = new (StellarSdk as any).Contract(contractId);
    const inv = ContractBuilders.buildCommitRandomness(raffleId, commitment);

    const tx = new (StellarSdk as any).TransactionBuilder(account, {
      fee,
      networkPassphrase,
    })
      .addOperation(contract.call(inv.method, ...inv.args))
      .setTimeout(30)
      .build();
    
    return rpcServer.prepareTransaction(tx);
  }

  public async buildRevealTx(
    rpcServer: any,
    contractId: string,
    networkPassphrase: string,
    sourceAddress: string,
    raffleId: number,
    secret: string,
    nonce: string,
    feeStroops: number,
  ) {
    const account = await rpcServer.getAccount(sourceAddress);
    const fee = (Number((StellarSdk as any).BASE_FEE || 100) * feeStroops).toString();
    const contract = new (StellarSdk as any).Contract(contractId);
    const inv = ContractBuilders.buildRevealRandomness(raffleId, secret, nonce);

    const tx = new (StellarSdk as any).TransactionBuilder(account, {
      fee,
      networkPassphrase,
    })
      .addOperation(contract.call(inv.method, ...inv.args))
      .setTimeout(30)
      .build();
    
    return rpcServer.prepareTransaction(tx);
  }
}

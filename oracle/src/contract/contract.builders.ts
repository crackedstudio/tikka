import * as StellarSdk from '@stellar/stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';

export interface ContractInvocation {
  method: string;
  args: StellarSdk.xdr.ScVal[];
}

export class ContractBuilders {
  static parseToBytes(input: string, expectedLen?: number): Buffer {
    if (!input) return Buffer.alloc(expectedLen ?? 0);
    const hexLike = /^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0;
    let buf = hexLike ? Buffer.from(input, 'hex') : Buffer.from(input, 'utf8');
    if (expectedLen !== undefined) {
      if (buf.length > expectedLen) buf = buf.subarray(0, expectedLen);
      else if (buf.length < expectedLen) {
        const padded = Buffer.alloc(expectedLen);
        buf.copy(padded);
        buf = padded;
      }
    }
    return buf;
  }

  static buildGetRaffleData(raffleId: number): ContractInvocation {
    return {
      method: 'get_raffle_data',
      args: [StellarSdk.xdr.ScVal.scvU32(raffleId >>> 0)],
    };
  }

  static buildCommitRandomness(raffleId: number, commitment: string): ContractInvocation {
    return {
      method: 'commit_randomness',
      args: [
        StellarSdk.xdr.ScVal.scvU32(raffleId >>> 0),
        StellarSdk.xdr.ScVal.scvBytes(this.parseToBytes(commitment, 32)),
      ],
    };
  }

  static buildRevealRandomness(raffleId: number, secret: string, nonce: string): ContractInvocation {
    return {
      method: 'reveal_randomness',
      args: [
        StellarSdk.xdr.ScVal.scvU32(raffleId >>> 0),
        StellarSdk.xdr.ScVal.scvBytes(this.parseToBytes(secret, 32)),
        StellarSdk.xdr.ScVal.scvBytes(this.parseToBytes(nonce, 16)),
      ],
    };
  }

  static buildReceiveRandomness(raffleId: number, randomness: RandomnessResult): ContractInvocation {
    return {
      method: 'receive_randomness',
      args: [
        StellarSdk.xdr.ScVal.scvU32(raffleId >>> 0),
        StellarSdk.xdr.ScVal.scvBytes(this.parseToBytes(randomness.seed, 32)),
        StellarSdk.xdr.ScVal.scvBytes(this.parseToBytes(randomness.proof, 64)),
      ],
    };
  }
}

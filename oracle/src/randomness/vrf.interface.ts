import { RandomnessResult } from '../queue/queue.types';

export enum VrfAlgorithm {
  Ed25519Sha256 = 'Ed25519-SHA-256',
}

export interface IVrfProvider {
  readonly algorithm: VrfAlgorithm;
  compute(requestId: string, raffleId?: number): Promise<RandomnessResult>;
  verify(publicKey: string | Buffer, requestId: string, proof: string, seed: string, raffleId?: number): boolean;
}

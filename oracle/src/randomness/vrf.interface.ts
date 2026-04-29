import { RandomnessResult } from '../queue/queue.types';

export enum VrfAlgorithm {
  Ed25519Sha256 = 'Ed25519-SHA-256',
}

export interface IVrfProvider {
  readonly algorithm: VrfAlgorithm;
  compute(requestId: string): Promise<RandomnessResult>;
  verifyProof(
    publicKey: string | Buffer,
    requestId: string,
    proof: string,
  ): { valid: boolean; seed?: string };
  verify(publicKey: string | Buffer, requestId: string, proof: string, seed: string): boolean;
}

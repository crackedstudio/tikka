import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { IVrfProvider, VrfAlgorithm } from './vrf.interface';
import { Ed25519Sha256VrfProvider } from './ed25519-sha256.vrf-provider';

@Injectable()
export class VrfService {
  private readonly logger = new Logger(VrfService.name);
  private readonly providers: Map<VrfAlgorithm, IVrfProvider>;

  constructor(private readonly keyService: KeyService) {
    const ed25519Provider = new Ed25519Sha256VrfProvider(keyService);
    this.providers = new Map([[VrfAlgorithm.Ed25519Sha256, ed25519Provider]]);
  }

  /**
   * Compute VRF output using the specified algorithm (defaults to Ed25519-SHA-256).
   * The algorithm can be driven by a contract requirement field in the future.
   */
  async compute(
    requestId: string,
    algorithm: VrfAlgorithm = VrfAlgorithm.Ed25519Sha256,
  ): Promise<RandomnessResult> {
    const provider = this.getProvider(algorithm);
    this.logger.debug(`Computing VRF for requestId=${requestId} algorithm=${algorithm}`);
    return provider.compute(requestId);
  }

  verify(
    publicKey: string | Buffer,
    requestId: string,
    proof: string,
    seed: string,
    algorithm: VrfAlgorithm = VrfAlgorithm.Ed25519Sha256,
  ): boolean {
    return this.getProvider(algorithm).verify(publicKey, requestId, proof, seed);
  }

  private getProvider(algorithm: VrfAlgorithm): IVrfProvider {
    const provider = this.providers.get(algorithm);
    if (!provider) throw new Error(`Unsupported VRF algorithm: ${algorithm}`);
    return provider;
  }
}

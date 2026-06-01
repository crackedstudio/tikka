import { RandomnessResult } from '../queue/queue.types';

/**
 * Unified randomness provider interface.
 * 
 * Supports VRF, PRNG, and future randomness providers with a consistent API.
 * Each provider implements request validation, seed generation, proof generation,
 * and verification metadata.
 */

export enum RandomnessProviderType {
  VRF = 'vrf',
  PRNG = 'prng',
}

export interface RandomnessProviderMetadata {
  /** Provider type identifier */
  type: RandomnessProviderType;
  
  /** Algorithm or method name (e.g., 'Ed25519-SHA-256', 'SHA-256-PRNG') */
  algorithm: string;
  
  /** Human-readable description */
  description: string;
  
  /** Whether this provider produces cryptographically verifiable proofs */
  isVerifiable: boolean;
}

export interface RandomnessRequestInput {
  /** Unique request identifier from the contract */
  requestId: string;
  
  /** Optional raffle ID for domain separation */
  raffleId?: number;
  
  /** Optional prize amount for provider selection logic */
  prizeAmount?: number;
}

export interface RandomnessResponse extends RandomnessResult {
  /** Provider type that generated this randomness */
  provider: RandomnessProviderType;
  
  /** Algorithm used */
  algorithm: string;
  
  /** Timestamp of generation */
  generatedAt: Date;
}

export interface VerificationResult {
  /** Whether the proof is valid */
  valid: boolean;
  
  /** Derived seed if verification succeeded */
  seed?: string;
  
  /** Error message if verification failed */
  error?: string;
}

/**
 * Core randomness provider interface.
 * All randomness providers (VRF, PRNG, future providers) must implement this.
 */
export interface IRandomnessProvider {
  /**
   * Get provider metadata.
   */
  getMetadata(): RandomnessProviderMetadata;
  
  /**
   * Validate a randomness request before processing.
   * 
   * @param input Request input parameters
   * @returns true if valid, false otherwise
   */
  validateRequest(input: RandomnessRequestInput): boolean;
  
  /**
   * Generate randomness (seed + proof) for a request.
   * 
   * @param input Request input parameters
   * @returns Randomness response with provider metadata
   */
  generate(input: RandomnessRequestInput): Promise<RandomnessResponse>;
  
  /**
   * Verify a proof and derive the seed.
   * 
   * @param publicKey Public key for verification (if applicable)
   * @param requestId Request identifier
   * @param proof Proof to verify
   * @param raffleId Optional raffle ID
   * @returns Verification result with derived seed
   */
  verifyProof(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    raffleId?: number,
  ): VerificationResult;
  
  /**
   * Verify both proof and seed match.
   * 
   * @param publicKey Public key for verification (if applicable)
   * @param requestId Request identifier
   * @param proof Proof to verify
   * @param seed Expected seed
   * @param raffleId Optional raffle ID
   * @returns true if both proof and seed are valid
   */
  verify(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    seed: string,
    raffleId?: number,
  ): boolean;
}

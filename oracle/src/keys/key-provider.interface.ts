/**
 * KeyProvider interface for secure key management.
 * 
 * Implementations must ensure that private keys are never exposed in memory
 * when using HSM-backed providers (AWS KMS, Google Cloud KMS, etc.).
 */
export interface KeyProvider {
  /**
   * Returns the oracle's public key as a string.
   */
  getPublicKey(): Promise<string>;

  /**
   * Returns the raw public key bytes (32 bytes).
   */
  getPublicKeyBuffer(): Promise<Buffer>;

  /**
   * Signs data using the oracle's private key.
   * For HSM providers, this operation is performed within the HSM.
   * 
   * @param data The data to sign
   * @returns Ed25519 signature (64 bytes)
   */
  sign(data: Buffer): Promise<Buffer>;

  /**
   * Returns the provider type for logging and debugging.
   */
  getProviderType(): string;
}

/**
 * Configuration for key providers.
 */
export interface KeyProviderConfig {
  type: 'env' | 'aws-kms' | 'gcp-kms';
  
  // For 'env' provider
  privateKey?: string;
  
  // For AWS KMS provider
  awsRegion?: string;
  awsKeyId?: string;
  
  // For GCP KMS provider
  gcpProjectId?: string;
  gcpLocationId?: string;
  gcpKeyRingId?: string;
  gcpKeyId?: string;
  gcpKeyVersion?: string;
}

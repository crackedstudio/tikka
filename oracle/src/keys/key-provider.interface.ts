/**
 * Possible health states for a key provider.
 *
 *  - healthy:     Provider is reachable and the active key can be read.
 *  - unavailable: Provider could not be contacted (network timeout, service down).
 *  - permission_denied: Provider is reachable but the oracle lacks the required
 *                       credentials / IAM permissions to read the key.
 *  - unknown:     An unexpected error occurred that does not fit the above categories.
 */
export type KeyProviderStatus = 'healthy' | 'unavailable' | 'permission_denied' | 'unknown';

/**
 * Safe, secret-free health snapshot returned by every KeyProvider.
 *
 * SECURITY CONTRACT: This object MUST NOT contain, directly or indirectly,
 * any private key material, seed bytes, or secret tokens.
 */
export interface KeyProviderHealth {
  /** Whether the provider is currently operational. */
  status: KeyProviderStatus;

  /**
   * The active key's public identifier.
   * For `env`     — the Stellar G-address (public key).
   * For `aws-kms` — the AWS KMS key ARN / alias.
   * For `gcp-kms` — the full GCP KMS key-version resource name.
   *
   * null when the provider is unreachable and the value is not cached.
   */
  activeKeyId: string | null;

  /**
   * A short human-readable description of the health result or failure reason.
   * Sensitive details (raw error messages that may contain credentials or key
   * fragments) are stripped before being placed here.
   */
  message: string;

  /** ISO-8601 timestamp of when this snapshot was taken. */
  checkedAt: string;

  /** Provider discriminator (e.g. 'env', 'aws-kms', 'gcp-kms'). */
  providerType: string;
}

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

  /**
   * Probes the key provider and returns a safe health snapshot.
   *
   * SECURITY CONTRACT: The returned {@link KeyProviderHealth} object MUST NOT
   * include private key material, seeds, or secret tokens under any circumstances,
   * including error paths.
   */
  getProviderHealth(): Promise<KeyProviderHealth>;
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

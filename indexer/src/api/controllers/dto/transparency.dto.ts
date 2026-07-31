/**
 * Transparency/Audit Log DTOs — VRF proof verification and on-chain transparency.
 * Provides immutable access to oracle submissions for independent verification.
 */

export interface TransparencyEntryDto {
  id: string;
  timestamp: string;
  raffle_id: number;
  request_id: string;
  oracle_id: string;
  seed: string;        // SHA-256 seed (hex)
  proof: string;       // Ed25519 signature (hex)
  tx_hash: string;     // Stellar transaction hash
  method: 'VRF' | 'PRNG';
}

export interface TransparencyLogResponseDto {
  entries: TransparencyEntryDto[];
  total: number;
}

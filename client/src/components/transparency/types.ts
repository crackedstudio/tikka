// Shared types for the Transparency page and its sub-components.

export interface AuditLogEntry {
    id: string;
    timestamp: string;
    raffle_id: number;
    request_id: string;
    oracle_id: string;
    /** Ed25519 signature (VRF) or double-SHA-256 preimage (PRNG) — hex encoded */
    proof: string;
    /** SHA-256(proof) for VRF; SHA-256(request_id || raffle_id_u32_be) for PRNG — hex encoded */
    seed: string;
    tx_hash: string;
    /** VRF: Ed25519 signed proof bound to the oracle key. PRNG: deterministic hash output. */
    method: "VRF" | "PRNG";
}

export interface AuditLogResponse {
    entries: AuditLogEntry[];
    total: number;
}

export interface TransparencyStats {
    total_raffles: number;
    total_tickets: number;
    total_volume_xlm: string;
    prizes_distributed_xlm: string;
    draws_completed: number;
    /** Ed25519 public key of the oracle used to verify VRF proofs */
    oracle_public_key: string;
    recent_audit_log: AuditLogEntry[];
}

export interface VerifyResult {
    verified: boolean;
    /** The proof that was checked (may be empty on failure) */
    proof: string;
    reason?: string;
}

export const PAGE_SIZE = 20;
export const REFRESH_INTERVAL_MS = 30_000;

/** Truncate a string to at most `n` characters, appending an ellipsis when clipped. */
export const truncate = (s: string, n = 16): string =>
    s.length > n ? `${s.slice(0, n)}…` : s;

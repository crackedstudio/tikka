# Multi-Oracle Support

## Overview

This document describes the multi-oracle architecture for the Tikka randomness oracle system. Multi-oracle support decentralizes trust by requiring randomness proofs from multiple independent oracles before finalizing raffle results.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     MULTI-ORACLE ARCHITECTURE                           │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │  Contract   │                                                        │
│  │ (on-chain)  │◄──── N-of-M oracle submissions                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ▼                                                               │
│  RandomnessRequested Event                                              │
│         │                                                               │
│         ▼                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Oracle 1   │  │   Oracle 2   │  │   Oracle N   │                 │
│  │  (VRF/PRNG)  │  │  (VRF/PRNG)  │  │  (VRF/PRNG)  │                 │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
│         │                 │                 │                           │
│         └────────┬────────┴────────┬────────┘                           │
│                  ▼                ▼                                    │
│           ┌─────────────┐  ┌─────────────┐                             │
│           │  Coordinator │  │  Contract   │                             │
│           │  (XOR seeds) │  │ (aggregates)│                             │
│           └─────────────┘  └─────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Modes

### Single Oracle Mode (Default)
- **Use case**: Development, testing, low-stakes raffles
- **Trust model**: Single point of trust
- **Configuration**: `ORACLE_PRIVATE_KEY` only

### Multi-Oracle Mode
- **Use case**: Production, high-stakes raffles
- **Trust model**: Decentralized, N-of-M threshold
- **Configuration**: `MULTI_ORACLE_ENABLED=true` with oracle registry

## Trust Model

### Security Properties

| Property | Single Oracle | Multi-Oracle |
|----------|---------------|--------------|
| **Unpredictability** | VRF output only known to single oracle | Requires N oracles to collude |
| **Verifiability** | Single oracle proof verifiable | All oracle proofs verifiable |
| **Liveness** | Single point of failure | Byzantine fault tolerant (N > 2f) |
| **Collusion Resistance** | Vulnerable to oracle collusion | Requires N-1 oracles to collude |

### Threshold Configuration

```
N = Total number of registered oracles
T = Threshold (minimum submissions required)

For Byzantine fault tolerance: T > N/2

Examples:
- 3-of-5: Can tolerate 2 byzantine oracles (f=2, T=3 > 5/2=2.5)
- 2-of-3: Can tolerate 1 byzantine oracle (f=1, T=2 > 3/2=1.5)
- 4-of-7: Can tolerate 3 byzantine oracles (f=3, T=4 > 7/2=3.5)
```

## Configuration

### Environment Variables

#### Single Oracle Mode
```bash
ORACLE_PRIVATE_KEY=S...  # Stellar secret key
```

#### Multi-Oracle Mode
```bash
# Enable multi-oracle mode
MULTI_ORACLE_ENABLED=true

# Local oracle identifier
LOCAL_ORACLE_ID=oracle-001

# Oracle registry: comma-separated list of oracle-id:public-key:weight[:local]
ORACLE_REGISTRY=oracle-001:GXXX...:1:local,oracle-002:GYYY...:1,oracle-003:GZZZ...:1

# Threshold: minimum submissions required
MULTI_ORACLE_THRESHOLD=2

# Private keys for local oracles (if this oracle manages multiple)
ORACLE_SECRETS=oracle-001:S...:local
```

### Oracle Registry Format

```
oracle-id:public-key:weight[:local]
```

| Field | Description |
|-------|-------------|
| `oracle-id` | Unique identifier (e.g., `oracle-001`) |
| `public-key` | Stellar public key (G...) |
| `weight` | Voting weight (default: 1) |
| `local` | Optional flag: this oracle runs locally |

Example:
```
ORACLE_REGISTRY=oracle-001:GDQ...:1:local,oracle-002:GDI...:1,oracle-003:GDO...:1
```

## Seed Aggregation

When multiple oracles submit randomness, the final seed is computed via XOR:

```
final_seed = oracle_1.seed XOR oracle_2.seed XOR ... XOR oracle_T.seed
```

This approach:
- **Commutative**: Order of submissions doesn't matter
- **Non-interactive**: No oracle needs to coordinate with others
- **Unbiased**: Final seed is unpredictable if any single oracle is honest
- **Efficient**: XOR is O(32) vs. more complex threshold schemes

### Proof Aggregation

```
final_proof = SHA-512(proof_1 || proof_2 || ... || proof_T)
```

The proof is hashed together to create a verifiable audit trail.

## Contract-Side Requirements

The Soroban contract must be updated to support multi-oracle:

### Required Changes

```rust
// Storage: Track oracle submissions per request
struct OracleSubmission {
    oracle: Address,
    seed: BytesN<32>,
    proof: BytesN<64>,
}

// Storage: Track registered oracles
struct OracleRegistry {
    oracles: Vec<Address>,
    threshold: u32,
}

// New storage keys
const ORACLE_REGISTRY: Symbol = symbol!("oracles");
const SUBMISSION_COUNT: Symbol = symbol!("submissions");
const THRESHOLD: Symbol = symbol!("threshold");

// Updated receive_randomness
pub fn receive_randomness(
    env: Env,
    raffle_id: u32,
    seed: BytesN<32>,
    proof: BytesN<64>,
    oracle_sig: Signature,
) -> Result<(), Error> {
    // 1. Verify oracle is registered
    // 2. Verify VRF proof from oracle's public key
    // 3. Store submission
    // 4. Check if threshold reached
    // 5. If threshold reached, aggregate and select winner
}
```

### Contract Functions Needed

```rust
// Admin: Manage oracle registry
pub fn add_oracle(env: Env, oracle: Address, weight: u32)
pub fn remove_oracle(env: Env, oracle: Address)
pub fn set_threshold(env: Env, threshold: u32)

// Query: Get oracle status
pub fn get_oracle_count(env: Env) -> u32
pub fn get_threshold(env: Env) -> u32
pub fn get_submission_count(env: Env, raffle_id: u32) -> u32
pub fn get_oracle_submissions(env: Env, raffle_id: u32) -> Vec<OracleSubmission>

// Updated: Handle multi-oracle randomness
pub fn receive_randomness(
    env: Env,
    raffle_id: u32,
    seed: BytesN<32>,
    proof: BytesN<64>,
    signature: Signature,
) -> Result<bool, Error>  // Returns true if raffle finalized
```

## Threshold Signatures (Future Work)

### BLS Threshold Signatures

For more efficient multi-party computation, consider BLS threshold signatures:

1. **Key Generation**: Distributed Key Generation (DKG) among oracles
2. **Signing**: Each oracle produces a partial signature
3. **Aggregation**: Combine partial signatures into final signature
4. **Verification**: Single aggregated signature verifies

#### Advantages
- Single on-chain transaction
- Smaller proof size (single BLS signature vs. N signatures)
- Faster finalization

#### Challenges
- Stellar/Soroban doesn't natively support BLS12-381
- Requires additional contract logic
- More complex key management

#### Research Notes
- See [IBM TSS](https://github.com/IBM/TSS) for threshold signature library
- See [Alin Tomescu's threshold BLS research](https://alinush.github.io/threshold-bls) for efficient Lagrange coefficients
- Consider FROST (Flexible Round-Optimized Schnorr Threshold Signatures)

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| OracleRegistryService | ✅ | Manages multiple oracle keys |
| MultiOracleCoordinator | ✅ | Tracks submissions, computes XOR |
| RandomnessWorker | ✅ | Multi-oracle submission handling |
| VRF Service | ✅ | Per-oracle VRF computation |
| Health Endpoint | ✅ | Multi-oracle status reporting |
| Contract Updates | ⏳ | Requires Rust implementation |
| BLS Threshold | 🔲 | Future enhancement |

## Monitoring

### Health Endpoint Response

```json
{
  "status": "healthy",
  "multiOracle": {
    "enabled": true,
    "mode": "multi-oracle",
    "localOracleId": "oracle-001",
    "threshold": 2,
    "totalOracles": 3,
    "oracleIds": ["oracle-001", "oracle-002", "oracle-003"],
    "pendingSubmissions": [
      {
        "raffleId": 42,
        "requestId": "req-123",
        "submissions": 1,
        "threshold": 2
      }
    ]
  }
}
```

### Alerts

Configure alerts for:
- `multiOracle.pendingSubmissions.length > 0` for > 5 minutes
- `metrics.streamStatus !== 'connected'`
- `metrics.queueDepth > 10`

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern=multi-oracle
```

### Integration Tests

Test multi-oracle coordination:
1. Start 3 oracle instances
2. Submit randomness from 2 oracles
3. Verify aggregation works
4. Verify threshold enforcement

## References

- [Decentralized Oracle Networks](https://docs.chain.link/docs/architecture-decentralized-model)
- [Threshold BLS Signatures](https://alinush.github.io/threshold-bls)
- [IBM TSS Library](https://github.com/IBM/TSS)
- [FROST Threshold Signatures](https://eprint.iacr.org/2020/852.pdf)
- [Stellar Soroban SDK](https://github.com/stellar/js-stellar-sdk)

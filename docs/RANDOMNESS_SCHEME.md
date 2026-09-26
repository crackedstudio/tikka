# Randomness scheme and trust assumptions

This document explains how Tikka derives raffle outcomes, what assumptions users must make about the oracle, and how a third party can verify a past draw without relying on the oracle operator.

## 1. What the oracle actually does

When a raffle reaches the drawing phase, the contract emits a randomness request. The oracle listens for that request and submits a final randomness payload back to the contract.

The current implementation has two paths:

- High-stakes raffles (prize amount greater than or equal to 500 XLM): the oracle uses a VRF-style Ed25519 signature over the request input.
- Low-stakes raffles (prize amount below 500 XLM): the oracle uses a deterministic hash-based PRNG output.

There is also a commit/reveal helper in the oracle code for a pre-commit protocol, but the main draw path is the VRF/PRNG submission described below.

## 2. Source of entropy and the encoding used

### VRF path (high-stakes)

The oracle computes:

- input bytes = UTF-8(request_id) followed by the 4-byte big-endian encoding of raffle_id, if present
- proof = Ed25519 signature over that input using the oracle's private key
- seed = SHA-256(proof)

The proof and seed are submitted to the contract as the randomness payload.

Why this matters:

- The output is bound to the request identifier and raffle identifier.
- The contract can verify the proof with the oracle's public key before accepting the seed.
- A third party can recompute the same seed from the proof and the request input.

### PRNG path (low-stakes)

The oracle computes:

- seed = SHA-256(request_id bytes || raffle_id_u32_be)
- proof = SHA-256("PRNG:v1:1:" || request_id) || SHA-256("PRNG:v1:2:" || request_id)

This is deterministic and reproducible, but it does not rely on a public-key proof. The contract only checks that the payload has the expected shape and size.

### Commit/reveal helper

The oracle also supports a helper that:

- samples a random secret and nonce
- publishes commitment = SHA-256(secret || nonce)
- later reveals the secret and nonce for verification

This gives a classic binding property: after the commitment is published, the oracle cannot later change the revealed values without producing a different preimage that fails the commitment check. However, this helper is not the main source of entropy for the draw; it is an additional binding step around a value the oracle chooses.

## 3. Threat model and trust assumptions

The important trust boundary is the oracle key and the contract verification logic.

### What a malicious oracle could do

- If the oracle controls the VRF private key, it can produce a valid proof for any request input it wants to sign. In that case, it can influence the randomness output before submission.
- For the PRNG path, a malicious oracle can choose an arbitrary payload because the contract does not verify a public-key signature for that path. This is why high-stakes raffles use VRF rather than PRNG.
- A malicious oracle cannot retroactively change a committed value after the commitment has been published without breaking the commitment check.

### What a malicious oracle cannot do

- It cannot make a draw appear to have used a different request_id or raffle_id without changing the underlying request data.
- For the VRF path, an altered proof or altered input will fail verification against the oracle public key.
- For the PRNG path, the output is deterministic and reproducible, but it is not protected by the same public-key verification as the VRF path.

### Practical trust summary

Users should trust a draw only as much as the path used:

- VRF path: strong verifiability, assuming the oracle private key remains secret and the contract verifies the proof.
- PRNG path: reproducible and inspectable, but weaker trust because the contract does not validate it with a public-key signature.

## 4. Multi-oracle consensus and Byzantine fault tolerance

When the oracle runs in multi-oracle mode, randomness is derived from multiple independent oracle nodes. This prevents a single malicious or compromised node from manipulating the draw outcome.

### How consensus works

Each round has two parameters:

- **Threshold (N):** the minimum number of oracle nodes that must respond before a round can proceed.
- **Consensus threshold (K):** the number of nodes that must agree on the same seed value for their response to be accepted.

A round succeeds when at least K out of the responding nodes produce identical seed values. The aggregated seed is the XOR of all seeds in the consensus group; proofs are combined. Every node in the consensus group is recorded in the submission payload.

### Byzantine failure modes handled

| Failure mode | Behaviour |
|---|---|
| **Honest minority (unanimous)** | All nodes agree, consensus succeeds, submission proceeds. |
| **Threshold met with dissent** | Enough nodes agree (≥K) despite some dissenters. Those who agreed form the consensus group; the dissenting nodes are excluded. The submission uses only the consensus group's values. |
| **Threshold not met** | Fewer than K nodes agree on the same seed. Consensus fails; the system **refuses to submit** the randomness. No fallback to a single node's value ever occurs — the draw is simply not finalized in this round. |
| **Non-revealing node** | A node that committed to participate but never reveals its seed. If the remaining nodes still meet the threshold and consensus threshold, the round proceeds without the non-revealing node. If not, the round fails (refuses to submit, no single-node fallback). |
| **Equivocating node (commit-reveal mismatch)** | A node that reveals a seed whose hash does not match its earlier commitment. The node is excluded from the round, and its operator is alerted at severity critical. |
| **Insufficient quorum** | Fewer than N nodes respond at all (data-availability failure). The system falls back to the local node's value so the raffle can still be drawn, but this path offers no Byzantine protection. |

### What this guarantees

- A single dishonest node cannot cause a submission of manipulated randomness unless it also controls K-1 other responding nodes.
- Consensus failure never degrades to a single node's value — the system refuses to submit rather than fall back.
- Equivocation (different values to different peers) is detectable through the commitment binding: a node that commits to hash H but reveals seed S where SHA-256(S) ≠ H is excluded and its operator is alerted.
- A node that participates in the commit phase but vanishes before reveal is treated as missing; if sufficient honest nodes remain, the round proceeds without it.

## 5. Why outcomes are verifiable

The VRF path is verifiable because the contract can check the proof against the registered oracle public key and then recompute the seed from the proof. A third party can reproduce the same check from the on-chain request and the submitted payload.

The PRNG path is still inspectable because the derivation is deterministic and public. A skeptical user can recompute the expected seed/proof from the request input and compare it with the values submitted on-chain.

## 6. How a third party can verify a past draw

1. Find the raffle and its randomness request on-chain.
   - Look for the contract event that emitted the draw request.
   - Record the request_id and raffle_id.

2. Find the randomness submission for that raffle.
   - Locate the transaction that called receive_randomness for that raffle.
   - Extract the submitted seed and proof values.

3. Recompute the expected output from the request input.
   - For VRF: recompute the encoded input, verify the proof with the oracle public key, then recompute seed = SHA-256(proof).
   - For PRNG: recompute seed = SHA-256(request_id || raffle_id_u32_be), and recompute the proof halves from the same request_id.

4. Compare your recomputed values with the values accepted by the contract.
   - If they match, the draw is consistent with the published request and the submitted payload.
   - If they do not match, the draw should be considered invalid or suspicious.

5. If a commit/reveal record exists, verify it as well.
   - Recompute commitment = SHA-256(secret || nonce).
   - Confirm that the published commitment matches and that the reveal values are the ones that produce it.

## 6. Audit log tamper evidence

The oracle records every randomness submission in the `vrf_audit_log` table in Supabase. This table is the evidence trail — it proves that a specific VRF proof, seed, and transaction hash were used for a given raffle.

### 6.1 Hash chain

Each audit record carries a `chain_hash` column. This value is computed as:

```
chain_hash = SHA-256(
  raffle_id ||
  commitment_hash ||
  reveal_hash ||
  proof ||
  seed ||
  oracle_public_key ||
  status ||
  committed_at ||
  previous_chain_hash
)
```

Where `previous_chain_hash` is the `chain_hash` of the immediately preceding record (ordered by the surrogate `id` column). The first record in the chain uses the string `"GENESIS"` as its predecessor.

This means every record cryptographically binds to its predecessor. Modifying any field of any record changes its `chain_hash`, which breaks the link to every subsequent record.

### 6.2 Verification

The oracle exposes a verification command that walks every record in order, recomputes each `chain_hash`, and compares it with what is stored. If any record has been tampered with, the command reports the exact position of the first broken link and exits with a non-zero status.

```
npx ts-node src/audit/audit-cli.ts verify-chain
# or start from a specific record ID:
npx ts-node src/audit/audit-cli.ts verify-chain --from-id 100
```

A REST endpoint is also available:

```
GET /oracle/audit/chain/verify?fromId=100
```

### 6.3 External anchoring

The hash chain alone prevents *internal* tampering (modifying individual records), but an attacker with full database access could rewrite the entire chain — including all `chain_hash` values. To defend against this, the operator periodically anchors the chain head to an external location.

Anchoring works by recording a point-in-time snapshot of the current chain head hash into a separate `audit_chain_anchors` table:

```
npx ts-node src/audit/audit-cli.ts anchor --type daily --external-ref https://example.com/audit-hashes
```

The resulting anchor record stores:

- `chain_head_hash` — the `chain_hash` of the most recent audit record at anchor time
- `record_count` — total number of audit records at anchor time
- `anchored_at` — when the anchor was created
- `anchor_type` — a label (e.g. `"cli"`, `"scheduled-cron"`)
- `external_ref` — an optional URL, transaction hash, or other identifier where the hash was published externally

The anchored hash should be published to a public, immutable location:

- A tweet, toot, or other public social-media post
- A GitHub Gist (pinned in the repository)
- A transaction memo on the Stellar blockchain
- A hash in a public bulletin board or transparency log

Once published, anyone can verify that the current audit chain head matches what was published at a known point in time.

```
npx ts-node src/audit/audit-cli.ts anchor-verify
```

Returns whether the latest anchor's chain head hash matches the current chain head.

### 6.4 Tamper-evident ≠ tamper-proof

This system is **tamper-evident**, not **tamper-proof**. The distinction is important:

- **Tamper-evident**: any modification to the audit records is detectable by running the verification command and comparing anchored hashes.
- **Tamper-proof**: no modification could ever be made, even by an operator with full database access.

An attacker who can simultaneously:

1. Modify audit records in the `vrf_audit_log` table,
2. Recompute all subsequent `chain_hash` values to match their modifications, and
3. Modify or delete all rows in the `audit_chain_anchors` table, **and**
4. Suppress the external publication (or forge the external record)

…could falsify the audit trail without detection. The external anchor raises the bar dramatically: an attacker would need to compromise both the database and every independent location where the anchor hash was published.

### 6.5 Recommended operational practices

| Practice | Why |
|---|---|
| Run `verify-chain` after every restart | Detects drift from interrupted operations. |
| Anchor the chain head at least once per day | Limits the window for undetected rewriting. |
| Publish the anchor hash to two independent locations | Prevents a single external compromise from hiding a rewrite. |
| Monitor verification results via the health endpoint | Surfaces silent failures before they compound. |

## 7. Operational notes

The oracle also records audit information such as the proof, transaction hash, and public key used for the submission. That audit trail helps operators and third parties reconstruct the randomness path after the fact.

In short: the system is verifiable when the contract and the oracle public key are available, and the trust assumption is that the oracle key is not abused. The PRNG path is simpler and deterministic, but it provides less cryptographic assurance than the VRF path.

The audit log hash chain makes the evidence trail tamper-evident: any retroactive edit is detectable, and external anchoring ensures the entire chain cannot be rewritten without detection by anyone watching the published anchors.
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

## 4. Why outcomes are verifiable

The VRF path is verifiable because the contract can check the proof against the registered oracle public key and then recompute the seed from the proof. A third party can reproduce the same check from the on-chain request and the submitted payload.

The PRNG path is still inspectable because the derivation is deterministic and public. A skeptical user can recompute the expected seed/proof from the request input and compare it with the values submitted on-chain.

## 5. How a third party can verify a past draw

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

## 6. Operational notes

The oracle also records audit information such as the proof, transaction hash, and public key used for the submission. That audit trail helps operators and third parties reconstruct the randomness path after the fact.

In short: the system is verifiable when the contract and the oracle public key are available, and the trust assumption is that the oracle key is not abused. The PRNG path is simpler and deterministic, but it provides less cryptographic assurance than the VRF path.

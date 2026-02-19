# Tikka Oracle

Listens for `RandomnessRequested` events from the Soroban contract, computes VRF (high-stakes) or PRNG (low-stakes), and submits `receive_randomness` back to the contract. The only service authorized to call that contract function.

**Stack:** NestJS, Stellar SDK, Soroban SDK.

## Intended structure (from spec)

- `src/listener/` — event listener for RandomnessRequested (Horizon SSE)
- `src/randomness/` — VRF service, PRNG fallback, commit-reveal
- `src/submitter/` — build and submit reveal transaction to Soroban
- `src/keys/` — oracle keypair management (HSM-ready)
- `src/queue/` — Bull queue for pending randomness requests
- `src/health/` — health check

Implementation to be added.

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 5 — tikka-oracle).

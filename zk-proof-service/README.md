# ZK Proof Service

A zero-knowledge proof service with **automated trusted setup ceremony verification**.

Implements [#792 – Automated Trusted Setup Ceremony (Powers of Tau) Integration](https://github.com/SoroLabs/SoroTask/issues/792).

---

## Overview

This service generates and verifies [Groth16](https://eprint.iacr.org/2016/260.pdf) zero-knowledge proofs using [snarkjs](https://github.com/iden3/snarkjs).

Before accepting any proof requests the service **verifies the integrity of all trusted setup artifacts** (Powers of Tau phase 1 and phase 2 `.zkey` files) against their published ceremony checksums. If any check fails the process exits with code `1` and no proofs are generated.

This guards against:
- Missing or incomplete ceremony output files.
- File corruption (disk errors, incomplete downloads).
- Tampered artifacts that could compromise ZK soundness.

---

## Startup sequence

```
1. Load .env
2. Ceremony verification (GATE — service exits here on failure)
   a. Assert all artifact files exist on disk
   b. Stream-hash each file (SHA-256) and compare to published checksum
   c. [optional] snarkjs structural verification of .zkey contribution chain
3. Load snarkjs
4. Start HTTP server
```

If **step 2** fails the service refuses to start and prints a clear error listing every failed check.

---

## Setup

### 1. Install dependencies

```bash
cd zk-proof-service
npm install
```

### 2. Obtain ceremony artifacts

#### Powers of Tau (phase 1)

Download a file from the [Hermez Perpetual Powers of Tau ceremony](https://github.com/iden3/snarkjs#7-prepare-phase-2) that matches your circuit's constraint count:

| File | Max constraints |
|------|----------------|
| `pot12_final.ptau` | 2¹² = 4 096 |
| `pot15_final.ptau` | 2¹⁵ = 32 768 |
| `pot18_final.ptau` | 2¹⁸ = 262 144 |

```bash
mkdir -p artifacts
curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_18.ptau \
     -o artifacts/pot18_final.ptau
```

Verify the checksum against the [published transcript](https://github.com/iden3/snarkjs#8-powers-of-tau-verification).

#### Phase 2 keys (circuit-specific)

Run your project's phase-2 ceremony to produce `circuit_final.zkey`, then export the verification key:

```bash
# Phase 2 ceremony setup
snarkjs groth16 setup circuit.r1cs artifacts/pot18_final.ptau artifacts/circuit_0000.zkey

# Contribute to phase 2 (add entropy)
snarkjs zkey contribute artifacts/circuit_0000.zkey artifacts/circuit_final.zkey \
  --name="Contributor Name" -v

# Export verification key
snarkjs zkey export verificationkey artifacts/circuit_final.zkey artifacts/vkey.json
```

### 3. Record checksums

Compute SHA-256 for each artifact and record them in `.env`:

```bash
sha256sum artifacts/pot18_final.ptau
sha256sum artifacts/circuit_final.zkey
sha256sum artifacts/vkey.json
```

Publish these hashes alongside your ceremony transcript so anyone can independently verify them.

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
PTAU_FILE_PATH=./artifacts/pot18_final.ptau
ZKEY_FILE_PATH=./artifacts/circuit_final.zkey
VKEY_FILE_PATH=./artifacts/vkey.json

EXPECTED_PTAU_CHECKSUM=<sha256 from step 3>
EXPECTED_ZKEY_CHECKSUM=<sha256 from step 3>
EXPECTED_VKEY_CHECKSUM=<sha256 from step 3>
```

### 5. Start the service

```bash
npm start
```

On success you will see:

```
[zk-proof-service] ✓ All ceremony artifacts verified successfully.
[zk-proof-service] Service listening on http://127.0.0.1:3010
```

---

## HTTP API

### `GET /health`

Liveness probe.

```json
{ "status": "ok", "service": "zk-proof-service" }
```

### `POST /prove`

Generate a Groth16 proof.

**Request body:**
```json
{
  "input": {
    "a": "3",
    "b": "11"
  }
}
```

**Response:**
```json
{
  "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...], "protocol": "groth16" },
  "publicSignals": ["33"]
}
```

### `POST /verify`

Verify a Groth16 proof.

**Request body:**
```json
{
  "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...], "protocol": "groth16" },
  "publicSignals": ["33"]
}
```

**Response:**
```json
{ "valid": true }
```

---

## Ceremony verification in detail

The verification logic lives in [`ceremony-verifier.js`](./ceremony-verifier.js).

### `verifyCeremonyArtifacts(config)`

| Step | What it checks | Failure behaviour |
|------|---------------|-------------------|
| **Existence** | All three artifact files exist at the configured paths | Aborts further checks, returns errors |
| **Checksum** | SHA-256 of each file matches the configured expected hash (constant-time comparison) | Adds a descriptive error per mismatch |
| **Structural** _(optional)_ | `snarkjs.zKey.verifyFromInit()` validates the phase-2 contribution chain | Adds error if chain is invalid |

`index.js` calls this function during `bootstrap()` before the HTTP server is created. If `result.valid === false` it logs all errors and calls `process.exit(1)`.

### Why constant-time comparison?

Even though a timing attack on a local file-hash comparison is practically infeasible, `crypto.timingSafeEqual` is used for the checksum comparison to follow the principle of least surprise and make the code auditable.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZK_SERVICE_HOST` | `127.0.0.1` | Bind address |
| `ZK_SERVICE_PORT` | `3010` | Bind port |
| `PTAU_FILE_PATH` | `./artifacts/pot18_final.ptau` | Path to `.ptau` file |
| `ZKEY_FILE_PATH` | `./artifacts/circuit_final.zkey` | Path to `.zkey` proving key |
| `VKEY_FILE_PATH` | `./artifacts/vkey.json` | Path to verification key JSON |
| `EXPECTED_PTAU_CHECKSUM` | _(required)_ | Published SHA-256 of `.ptau` |
| `EXPECTED_ZKEY_CHECKSUM` | _(required)_ | Published SHA-256 of `.zkey` |
| `EXPECTED_VKEY_CHECKSUM` | _(required)_ | Published SHA-256 of `vkey.json` |
| `ZKEY_STRUCTURAL_VERIFY` | `false` | Enable snarkjs contribution-chain verification |

---

## Running standalone verification

To verify artifacts without starting the HTTP service:

```bash
node ceremony-verifier.js
```

Exit code `0` = all checks passed. Exit code `1` = one or more checks failed (details printed to stderr).

---

## Security notes

- **Never commit `.env` to version control.** It is listed in `.gitignore`.
- The `artifacts/` directory contains large binary files — add them to `.gitignore` and distribute them through a separate, authenticated channel.
- Rotate the `EXPECTED_*_CHECKSUM` values whenever you run a new ceremony contribution.
- The service binds to `127.0.0.1` by default. Do not expose it directly to the internet without an authenticated reverse proxy.

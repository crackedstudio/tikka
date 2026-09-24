# Requirements Document

## Introduction

This feature enables the oracle service to rotate its Ed25519 signing key without restarting the process or dropping any in-flight VRF computation requests. Currently, `KeyProviderFactory` loads the private key once at startup; changing the key requires a full service restart, creating a window where draw requests time out. The solution introduces an atomic key-swap mechanism protected by the existing signing mutex, an admin-authenticated HTTP endpoint to trigger rotation, a 24-hour grace period during which the previous key remains available for proof verification, and an on-chain public key update via the Soroban contract's admin function.

## Glossary

- **KeyService**: The NestJS injectable service (`oracle/src/keys/key.service.ts`) that owns the active `KeyProvider` and exposes signing operations to the rest of the oracle.
- **KeyProvider**: The interface (`key-provider.interface.ts`) implemented by `EnvKeyProvider`, `AwsKmsKeyProvider`, and `GcpKmsKeyProvider` that abstracts private-key operations.
- **Active_Key**: The `KeyProvider` instance currently used to sign new VRF proofs and Stellar transactions.
- **Previous_Key**: The `KeyProvider` instance that was active before the most recent rotation; retained for the grace period to allow verification of proofs signed with the old key.
- **Rotation_Mutex**: A mutual-exclusion lock held by `KeyService` during signing operations to serialise access to `Active_Key`.
- **Grace_Period**: The 24-hour window after a rotation during which `Previous_Key` remains available for proof verification.
- **Admin_Endpoint**: The HTTP route `POST /oracle/admin/rotate-key` that triggers key rotation.
- **Admin_Guard**: The NestJS guard that validates the admin bearer token on the `Admin_Endpoint`.
- **ContractService**: The NestJS service (`oracle/src/contract/contract.service.ts`) that submits transactions to the Soroban raffle contract.
- **RotateKeyDto**: The validated request body accepted by the `Admin_Endpoint`, carrying the new key material encrypted with the admin public key.
- **KeyRotationEvent**: An internal event emitted after a successful rotation, consumed by `ContractService` to update the on-chain public key.

---

## Requirements

### Requirement 1: Atomic In-Process Key Swap

**User Story:** As an oracle operator, I want to replace the active signing key at runtime, so that key rotation does not require a service restart.

#### Acceptance Criteria

1. THE `KeyService` SHALL expose a `rotateKey(newProvider: KeyProvider): Promise<void>` method that replaces `Active_Key` with the supplied `KeyProvider`.
2. WHEN `rotateKey` is called, THE `KeyService` SHALL acquire `Rotation_Mutex` before swapping `Active_Key`, ensuring no concurrent signing operation reads a partially-updated key reference.
3. WHEN `rotateKey` is called, THE `KeyService` SHALL store the displaced `Active_Key` as `Previous_Key` together with a timestamp recording the moment of rotation.
4. WHEN `rotateKey` completes, THE `KeyService` SHALL release `Rotation_Mutex` so queued signing operations may proceed with the new key.
5. IF `newProvider` fails to return a valid public key during `rotateKey`, THEN THE `KeyService` SHALL abort the swap, retain the existing `Active_Key`, and throw a descriptive error.
6. FOR ALL calls to `sign(data)` that arrive while `rotateKey` holds `Rotation_Mutex`, THE `KeyService` SHALL queue those calls and complete them with `Active_Key` once the mutex is released.

---

### Requirement 2: Previous Key Grace Period

**User Story:** As a contract verifier, I want proofs signed with the old key to remain verifiable for 24 hours after rotation, so that in-flight draw requests are not invalidated.

#### Acceptance Criteria

1. WHILE `Previous_Key` exists and its rotation timestamp is less than 24 hours old, THE `KeyService` SHALL return `Previous_Key` from a `getPreviousProvider(): KeyProvider | null` method.
2. WHEN the 24-hour `Grace_Period` elapses, THE `KeyService` SHALL set `Previous_Key` to `null` and release any resources held by the expired provider.
3. THE `KeyService` SHALL expose a `getPreviousPublicKey(): Promise<string | null>` method that returns the previous public key string, or `null` if no `Previous_Key` exists or the `Grace_Period` has elapsed.
4. IF a second `rotateKey` call occurs before the `Grace_Period` of the first rotation has elapsed, THEN THE `KeyService` SHALL overwrite `Previous_Key` with the key displaced by the second rotation and reset the grace-period timer.

---

### Requirement 3: Admin-Authenticated Rotation Endpoint

**User Story:** As an oracle operator, I want a secure HTTP endpoint to trigger key rotation, so that rotation can be performed without direct server access.

#### Acceptance Criteria

1. THE `Admin_Endpoint` SHALL accept `POST /oracle/admin/rotate-key` requests carrying a `RotateKeyDto` body.
2. THE `RotateKeyDto` SHALL contain a `encryptedKey` field (base64-encoded string) holding the new private key material encrypted with the admin public key, and a `providerType` field (`'env' | 'aws-kms' | 'gcp-kms'`) indicating which `KeyProvider` to instantiate.
3. WHEN a request arrives at `Admin_Endpoint`, THE `Admin_Guard` SHALL validate the `Authorization: Bearer <token>` header against the `ADMIN_API_KEY` environment variable before the request reaches the rotation handler.
4. IF the `Authorization` header is absent or the token does not match `ADMIN_API_KEY`, THEN THE `Admin_Guard` SHALL return HTTP 401 and THE `KeyService` SHALL not be invoked.
5. WHEN `Admin_Guard` approves the request, THE rotation handler SHALL decrypt `encryptedKey` using the oracle's admin private key, construct the appropriate `KeyProvider`, and call `KeyService.rotateKey`.
6. WHEN rotation succeeds, THE `Admin_Endpoint` SHALL return HTTP 200 with a JSON body containing `{ "status": "rotated", "newPublicKey": "<string>", "previousPublicKey": "<string | null>" }`.
7. IF rotation fails for any reason, THEN THE `Admin_Endpoint` SHALL return HTTP 500 with a JSON body containing `{ "status": "error", "message": "<description>" }` and THE `Active_Key` SHALL remain unchanged.
8. THE `Admin_Endpoint` SHALL be excluded from the oracle's public Swagger documentation.

---

### Requirement 4: On-Chain Public Key Update

**User Story:** As a raffle participant, I want the contract to recognise the new oracle public key immediately after rotation, so that VRF proofs signed with the new key are accepted on-chain.

#### Acceptance Criteria

1. WHEN `KeyService.rotateKey` completes successfully, THE `ContractService` SHALL invoke the contract's `update_oracle_key` admin function with the new public key bytes.
2. WHEN the on-chain update transaction is submitted, THE `ContractService` SHALL sign it using `KeyService.signTransaction` with the new `Active_Key`.
3. IF the on-chain update transaction fails, THEN THE `ContractService` SHALL log the error at `ERROR` level and emit a `KeyRotationOnChainFailedEvent` so the operator can retry manually; THE in-process key swap SHALL NOT be rolled back.
4. THE `ContractService` SHALL retry the on-chain update up to 3 times with exponential back-off (base 2 seconds) before emitting `KeyRotationOnChainFailedEvent`.

---

### Requirement 5: In-Flight Request Continuity

**User Story:** As an oracle operator, I want queued VRF requests to complete without error during key rotation, so that no draw requests are dropped or timed out.

#### Acceptance Criteria

1. WHILE `Rotation_Mutex` is held during a key swap, THE `KeyService` SHALL not reject or cancel any pending `sign` or `signTransaction` calls; THE calls SHALL be queued and resolved after the mutex is released.
2. WHEN a VRF computation that began before rotation completes after rotation, THE `VrfService` SHALL submit the proof signed with the key that was active when the computation started.
3. THE `KeyService` SHALL expose a `getActiveSigningKey(): KeyProvider` method that returns a stable reference to `Active_Key` at the moment of the call, so callers can hold the reference for the duration of a single computation without being affected by a concurrent rotation.
4. FOR ALL `sign(data)` calls, THE `KeyService` SHALL complete the call with the `KeyProvider` reference obtained at the start of that call, even if `rotateKey` swaps `Active_Key` before the signing operation finishes.

---

### Requirement 6: Key Material Serialisation and Round-Trip Integrity

**User Story:** As an oracle operator, I want the encrypted key payload to be correctly parsed and reconstructed, so that the rotation endpoint reliably recovers the intended private key.

#### Acceptance Criteria

1. THE `RotateKeyDto` deserialiser SHALL parse the `encryptedKey` base64 string into a `Buffer` without data loss.
2. THE decryption routine SHALL decrypt the `Buffer` and produce a raw 32-byte Ed25519 private key `Buffer`.
3. FOR ALL valid 32-byte Ed25519 private key buffers `k`, encrypting `k` then decrypting the result SHALL produce a buffer equal to `k` (round-trip property).
4. IF the decrypted buffer is not exactly 32 bytes, THEN THE rotation handler SHALL return HTTP 400 with `{ "status": "error", "message": "Invalid key length" }` and SHALL NOT call `KeyService.rotateKey`.
5. IF the base64 decoding of `encryptedKey` fails, THEN THE rotation handler SHALL return HTTP 400 with `{ "status": "error", "message": "Invalid key encoding" }` and SHALL NOT call `KeyService.rotateKey`.

---

### Requirement 7: Audit Logging

**User Story:** As an oracle operator, I want every key rotation attempt to be logged with sufficient detail, so that I can audit who triggered a rotation and whether it succeeded.

#### Acceptance Criteria

1. WHEN a rotation request is received at `Admin_Endpoint`, THE `KeyService` SHALL log at `LOG` level: the timestamp, the previous public key, and the new public key.
2. WHEN rotation succeeds, THE `KeyService` SHALL log at `LOG` level: `"Key rotation completed"`, the new public key, and the grace-period expiry timestamp.
3. IF rotation fails, THE `KeyService` SHALL log at `ERROR` level: `"Key rotation failed"` and the error message.
4. THE audit log entries SHALL NOT include raw private key bytes or decrypted key material.

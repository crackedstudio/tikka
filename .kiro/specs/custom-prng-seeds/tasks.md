# Implementation Plan: custom-prng-seeds

## Overview

Implement custom PRNG seed support across four layers: Soroban contract, event listener, PRNG derivation, and audit logging. Each layer builds on the previous, ending with full wiring and audit traceability.

## Tasks

- [-] 1. Update Soroban contract — optional seed parameter
  - [ ] 1.1 Add `seed: Option<BytesN<32>>` parameter to `request_randomness` entry point
    - Modify the contract function signature to accept the optional seed
    - When `seed` is `Some(v)`, include the `seed` key in the `RandomnessRequested` event map
    - When `seed` is `None`, omit the `seed` key entirely to preserve backward compatibility
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.2 Write Rust contract tests for seed parameter
    - Test `request_randomness(raffle_id, Some(seed))` emits event with matching `seed` field
    - Test `request_randomness(raffle_id, None)` emits event without `seed` field
    - _Requirements: 1.2, 1.3_

  - [ ]* 1.3 Write property test for event seed round-trip (Property 1)
    - **Property 1: Event seed round-trip**
    - For any valid 32-byte seed, the emitted event `seed` bytes equal the input
    - Use `fc.uint8Array({minLength:32,maxLength:32})` for seed bytes
    - Tag: `// Feature: custom-prng-seeds, Property 1: Event seed round-trip`
    - **Validates: Requirements 1.2, 2.1**

- [x] 2. Update `RandomnessJobPayload` and `EventListenerService`
  - [x] 2.1 Add `customSeed?: string` to `RandomnessJobPayload` interface
    - Add the optional field to the existing interface definition
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Implement `parseSeedField` helper in `EventListenerService`
    - Decode `scvBytes` of length 32 to a 64-char lowercase hex string
    - On decode failure, log at `WARN` level and return `undefined`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.3 Extend `handleEvent` to extract optional `seed` map entry
    - Add `else if (keySym === 'seed')` branch calling `parseSeedField`
    - Set `customSeed` in the enqueued `RandomnessJobPayload`
    - _Requirements: 2.1, 2.2_

  - [ ]* 2.4 Write unit tests for `EventListenerService` seed parsing
    - Event with valid seed field → `customSeed` set to correct hex string
    - Event without seed field → `customSeed` is `undefined`
    - Event with malformed seed → `WARN` logged, `customSeed` is `undefined`
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Update `PrngService` — entropy mixing
  - [x] 3.1 Add optional `customSeed` parameter to `PrngService.compute`
    - Validate `customSeed` against `/^[0-9a-fA-F]{64}$/` when provided; throw descriptive `Error` on failure
    - Mix `customSeed_bytes` into the SHA-256 seed hasher after `requestId_bytes` when present
    - Leave proof derivation unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property test for PRNG seed derivation formula (Property 2)
    - **Property 2: PRNG seed derivation formula**
    - For any valid `requestId` and 64-char hex `customSeed`, `compute` returns `hex(SHA-256(requestId_bytes || customSeed_bytes [|| raffleId_u32_BE]))`
    - Use `fc.string()`, `fc.hexaString({minLength:64,maxLength:64})`, `fc.option(fc.nat({max:0xFFFFFFFF}))`
    - Tag: `// Feature: custom-prng-seeds, Property 2: PRNG seed derivation formula`
    - **Validates: Requirements 3.1, 3.4**

  - [ ]* 3.3 Write property test for backward compatibility (Property 3)
    - **Property 3: Backward compatibility — no custom seed preserves existing output and proof**
    - Without `customSeed`, output matches pre-feature derivation; proof is identical with or without `customSeed`
    - Use `fc.string()` for requestId, `fc.hexaString({minLength:64,maxLength:64})` for customSeed
    - Tag: `// Feature: custom-prng-seeds, Property 3: Backward compatibility`
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 3.4 Write property test for invalid custom seed rejection (Property 4)
    - **Property 4: Invalid custom seed is rejected**
    - Any non-64-char-hex string causes `compute` to throw and not return a result
    - Use `fc.oneof(fc.string().filter(s => !/^[0-9a-fA-F]{64}$/.test(s)), fc.hexaString({minLength:65}), fc.hexaString({maxLength:63}))`
    - Tag: `// Feature: custom-prng-seeds, Property 4: Invalid custom seed is rejected`
    - **Validates: Requirements 3.5**

  - [ ]* 3.5 Write property test for determinism (Property 5)
    - **Property 5: Determinism of PRNG computation**
    - Calling `compute` twice with identical inputs returns identical `seed` and `proof`
    - Use `fc.string()` for requestId, `fc.option(fc.hexaString({minLength:64,maxLength:64}))` for customSeed
    - Tag: `// Feature: custom-prng-seeds, Property 5: Determinism`
    - **Validates: Requirements 3.6**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update `RandomnessWorker` — propagate custom seed
  - [x] 5.1 Destructure `customSeed` from job payload and pass to `PrngService.compute`
    - Read `customSeed` from `job.data` in `handleRandomnessJob`
    - Pass `customSeed` to `prngService.compute` on the PRNG path only
    - Do not forward `customSeed` to `VrfService` on the VRF path
    - _Requirements: 4.1, 4.2_

  - [x] 5.2 Add `customSeed` to `RevealItem` and populate it in the worker
    - Add `customSeed?: string` to the `RevealItem` interface
    - Set `customSeed` when constructing the `RevealItem` passed to `BatchCollector`
    - _Requirements: 4.3_

  - [ ]* 5.3 Write property test for worker custom seed propagation (Property 6)
    - **Property 6: Custom seed propagation through the worker**
    - For any PRNG-method payload with optional `customSeed`, the `RevealItem` carries the same `customSeed` and `PrngService.compute` was called with it
    - Use `fc.record({raffleId: fc.nat(), requestId: fc.string(), customSeed: fc.option(fc.hexaString({minLength:64,maxLength:64}))})`
    - Tag: `// Feature: custom-prng-seeds, Property 6: Custom seed propagation through the worker`
    - **Validates: Requirements 4.1, 4.3**

  - [ ]* 5.4 Write unit tests for `RandomnessWorker` seed handling
    - VRF path: `VrfService.compute` is called without `customSeed`
    - PRNG path: `PrngService.compute` is called with `customSeed` from payload
    - _Requirements: 4.1, 4.2_

- [x] 6. Update `AuditLoggerService` — persist custom seed
  - [x] 6.1 Add `custom_seed: string | null` to `AuditLogEntry` interface
    - Add the new field to the interface definition
    - _Requirements: 5.1, 5.2_

  - [x] 6.2 Update `AuditLoggerService.log` to accept and persist `custom_seed`
    - Pass `revealItem.customSeed ?? null` as `custom_seed` when calling `log`
    - Ensure the field is written to the audit log entry
    - _Requirements: 5.1, 5.2_

  - [ ]* 6.3 Write property test for audit log custom seed persistence (Property 7)
    - **Property 7: Audit log persists custom seed**
    - For any `RevealItem`, the written `AuditLogEntry` has `custom_seed` equal to `customSeed` when present, or `null` when absent
    - Use `fc.record({...revealItemFields, customSeed: fc.option(fc.hexaString({minLength:64,maxLength:64}))})`
    - Tag: `// Feature: custom-prng-seeds, Property 7: Audit log persists custom seed`
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 6.4 Write unit tests for `AuditLoggerService` custom seed handling
    - Entry with `custom_seed: null` serialises correctly
    - Entry with a hex `custom_seed` round-trips through `readEntries`
    - _Requirements: 5.1, 5.2_

- [x] 7. Create `oracle/SECURITY.md` documentation
  - Create `oracle/SECURITY.md` describing the entropy-mixing scheme
  - Document the bias analysis: a caller who knows `requestId` in advance can choose `customSeed` to bias output within SHA-256 preimage resistance bounds
  - Recommend that `requestId` be generated on-chain after the seed is committed
  - Document that oracle's `requestId`-based entropy is always included, so a caller cannot produce arbitrary output
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use fast-check with a minimum of 100 iterations each
- Tag format for property tests: `// Feature: custom-prng-seeds, Property N: <description>`

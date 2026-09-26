# Contract Bindings Verification

This document describes how to regenerate and verify the Soroban contract bindings
used by `@tikka/sdk`.

## Regeneration

When the Soroban contract ABI changes (e.g., after a new deployment or a contract
upgrade), the TypeScript bindings must be regenerated.

### Prerequisites

- The [`stellar` CLI](https://developers.stellar.org/docs/build/soroban/getting-started/cli)
  installed and configured with the appropriate network credentials.
- The deployed contract ID for the target network.

### Command

```bash
stellar contract bindings typescript \
  --network testnet \
  --contract-id <CONTRACT_ID> \
  --output-dir sdk/src/contract/generated/
```

For mainnet:

```bash
stellar contract bindings typescript \
  --network mainnet \
  --contract-id <CONTRACT_ID> \
  --output-dir sdk/src/contract/generated/
```

### After Regeneration

1. Review the generated files in `sdk/src/contract/generated/` for correctness.
2. Run the SDK test suite to ensure no type regressions:
   ```bash
   cd sdk && pnpm test
   ```
3. Commit the regenerated files together with any required parser updates
   in `sdk/src/contract/parsers.ts`.

## Verification in CI

The CI workflow (`.github/workflows/ci.yml`) includes a step that checks whether
the generated bindings are up to date. If the bindings are stale, the CI job will
fail and prompt the contributor to regenerate them.

### How it works

The `verify-bindings` job runs the regeneration command in `--dry-run` mode (or
compares the generated output against the committed files) and fails if they
differ. This ensures that every PR that touches the contract ABI also updates the
bindings.

## File Locations

| File | Purpose |
|------|---------|
| `sdk/src/contract/generated/bindings.ts` | Auto-generated contract types and function constants |
| `sdk/src/contract/generated/index.ts` | Re-exports for the generated bindings |
| `sdk/src/contract/parsers.ts` | Shape-validating parsers for `scValToNative` results |
| `sdk/src/contract/bindings.ts` | Re-exports generated bindings for backward compatibility |
| `sdk/src/contract/contract.service.ts` | Uses parsers instead of raw `scValToNative` casts |
| `sdk/src/contract/response.ts` | Contract response envelope types (no `any` defaults) |

## Notes

- The `= any` default has been removed from all generic response types
  (`ContractResponse`, `TxResponse`, `UserTxResponse`, etc.) to ensure callers
  always supply an explicit type parameter.
- All `scValToNative` casts in `contract.service.ts` are replaced with parser
  functions from `parsers.ts` that validate shape and throw `TikkaSdkError` on
  mismatch.
- The `sdk/src/contract/` directory contains no `any` types.

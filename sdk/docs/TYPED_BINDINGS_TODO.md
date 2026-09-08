# Issue #2: Remove `any` Types and Generate Typed Bindings

**Status:** TODO - Requires contract deployment

## Summary

The SDK has ~286 `any` occurrences, concentrated in `sdk/src/contract/bindings.ts` and `sdk/src/contract/contract.service.ts` where `scValToNative` results are cast rather than parsed.

## Why This Is Deferred

This issue requires:
1. A deployed Soroban contract with a stable address
2. Access to the `stellar` CLI tool
3. The contract's WASM spec to be available on-chain

Without these, we cannot generate typed bindings.

## What Needs To Be Done

### Step 1: Generate Typed Bindings

Once the contract is deployed to testnet or mainnet:

```bash
stellar contract bindings typescript \
  --network testnet \
  --contract-id <CONTRACT_ID> \
  --output-dir sdk/src/contract/generated/
```

This will create TypeScript interfaces for all contract methods, parameters, and return types.

### Step 2: Replace Hand-Written Bindings

Replace the manual type casts in:
- `sdk/src/contract/bindings.ts` - Hand-written function name constants
- `sdk/src/contract/contract.service.ts` - Manual `scValToNative` casts

With generated parsers that:
- Validate the shape of returned data
- Throw typed `TikkaError` on mismatch
- Provide full IntelliSense support

### Step 3: Remove `any` Defaults

Update generic type parameters to remove `any` defaults:

```typescript
// Before
export type UserTxResponse<T = any> = ContractResponse<T>

// After
export type UserTxResponse<T> = ContractResponse<T>
```

This forces callers to supply explicit types, catching errors at compile time.

### Step 4: Document Regeneration

Create or update `sdk/CONTRACT_BINDINGS_VERIFICATION.md` with:
- When to regenerate bindings (contract upgrades)
- How to regenerate bindings (exact commands)
- How to verify bindings match the deployed contract
- CI integration instructions

### Step 5: Add to CI

Add a CI job that:
1. Fetches the contract spec from the network
2. Regenerates bindings
3. Diffs against committed bindings
4. Fails if they don't match (contract drift detection)

## Acceptance Criteria

- [ ] `sdk/src/contract/` contains no `any` types
- [ ] Contract response types are generated from the contract spec
- [ ] Generated bindings are committed under `sdk/src/contract/generated/`
- [ ] Regeneration is documented
- [ ] CI verifies bindings are up-to-date

## Related Files

- `sdk/src/contract/bindings.ts` - Current hand-written bindings
- `sdk/src/contract/contract.service.ts` - Manual type casts
- `sdk/src/types.ts` - Generic type definitions with `any` defaults

## Dependencies

- Deployed contract address (testnet or mainnet)
- `stellar` CLI installed and configured
- Contract WASM spec available on-chain

## Estimated Effort

- 4-8 hours once contract is deployed
- Most time will be spent updating service layer to use generated types
- Testing to ensure no runtime behavior changes

## Next Steps

1. Deploy contract to testnet
2. Run binding generation command
3. Review generated types
4. Update contract service to consume generated types
5. Remove `any` defaults from generic parameters
6. Add CI verification

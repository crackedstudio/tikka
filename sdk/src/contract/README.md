# SDK contract bindings

Typed Soroban bindings and deployment metadata for the Tikka raffle contract. Bindings must stay aligned with the contract version deployed on each network.

## Binding source

| Artifact | Role |
|----------|------|
| [`bindings.ts`](./bindings.ts) | Hand-written canonical function names (`ContractFn`) and `RaffleStatus` used by the SDK today |
| [`bindings.manifest.ts`](./bindings.manifest.ts) | Sorted ABI function list used by compatibility tests |
| [`contract-version.ts`](./contract-version.ts) | Version metadata: bindings semver, event schema version, binding source network/contract ID, default contract IDs per network |
| [`constants.ts`](./constants.ts) | Runtime contract addresses (defaults from `contract-version.ts`, overridable via env) |
| [`generated/`](./generated/) | Optional output from the Stellar CLI (not committed; see below) |

After a contract upgrade, update `contract-version.ts`, `bindings.manifest.ts`, and `bindings.ts` together (defaults in `constants.ts` follow `contract-version.ts`), then run the verification commands at the bottom of this file.

## Regenerate TypeScript bindings

From the `sdk` package root, with the [Stellar CLI](https://developers.stellar.org/docs/tools/cli) installed and a deployed contract ID:

```bash
cd sdk

stellar contract bindings typescript \
  --network testnet \
  --contract-id <DEPLOYED_RAFFLE_CONTRACT_ID> \
  --output-dir ./src/contract/generated
```

Use the same network and contract ID recorded in `contract-version.ts` under `bindingSource`. That ID is the deployment your bindings were generated from.

### Expected generated output

The CLI writes a small TypeScript package under `src/contract/generated/`. Typical layout:

```
src/contract/generated/
  package.json
  tsconfig.json
  src/
    index.ts          # Client entry and method wrappers
    types.ts          # ScVal / struct types from the contract spec
```

Exact file names can vary with CLI version; treat the generated `src/index.ts` and contract client exports as the review surface. Merge any new `pub fn` names into `bindings.ts` and `bindings.manifest.ts`, then bump `bindingsVersion` in `contract-version.ts`.

Generated output is gitignored. Only the hand-written files above are the committed SDK surface until you wire imports from `generated/`.

## Environment overrides

| Variable | Network |
|----------|---------|
| `TIKKA_CONTRACT_TESTNET` | testnet |
| `TIKKA_CONTRACT_MAINNET` | mainnet |
| `TIKKA_CONTRACT_STANDALONE` | standalone |
| `TIKKA_FACTORY_TESTNET` | optional factory (testnet) |
| `TIKKA_FACTORY_MAINNET` | optional factory (mainnet) |
| `TIKKA_FACTORY_STANDALONE` | optional factory (standalone) |

## Compatibility checks

[`contract.compat.ts`](./contract.compat.ts) verifies that:

- `ContractFn` values match `EXPECTED_CONTRACT_FUNCTIONS` in the manifest
- Default addresses in `constants.ts` match `contract-version.ts` (when env vars are unset)
- `bindingSource.contractId` matches the configured ID for `bindingSource.network`
- `eventSchemaVersion` is listed in `SUPPORTED_EVENT_SCHEMA_VERSIONS`

[`contract.compat.spec.ts`](./contract.compat.spec.ts) runs these checks in CI. If bindings and constants drift apart, tests fail.

## Verification

```bash
cd sdk
npm run lint
npm run test
npm run build
```

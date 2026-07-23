[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / FeeResourceBreakdown

# Interface: FeeResourceBreakdown

Defined in: [fee-estimator/fee-estimator.types.ts:84](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L84)

Detailed breakdown of the fee components returned by `estimateFee()`.

Stellar Soroban fees have two top-level components:
 - **base fee** — the minimum protocol fee every transaction pays (100 stroops by default)
 - **resource fee** — the extra charge for Soroban resource consumption (CPU, memory, ledger I/O)

The `cpuInstructions`, `diskReadBytes`, `writeBytes`, and ledger entry counts are raw
*consumption* metrics extracted from `transactionData.resources()`; they let UIs show
human-readable resource breakdowns before the user signs.

## Properties

### baseFeeStroops

> **baseFeeStroops**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:89](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L89)

Fixed minimum transaction fee paid to validators regardless of contract execution.
Protocol default: 100 stroops.

***

### cpuInstructions

> **cpuInstructions**: `number`

Defined in: [fee-estimator/fee-estimator.types.ts:101](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L101)

CPU instructions consumed by the contract invocation.
Sourced from `sim.transactionData.resources().instructions()`.

***

### diskReadBytes

> **diskReadBytes**: `number`

Defined in: [fee-estimator/fee-estimator.types.ts:107](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L107)

Bytes read from disk (state) during the invocation.
Sourced from `sim.transactionData.resources().diskReadBytes()`.

***

### readOnlyEntries

> **readOnlyEntries**: `number`

Defined in: [fee-estimator/fee-estimator.types.ts:119](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L119)

Number of read-only ledger entries accessed in the invocation footprint.
Sourced from `sim.transactionData.resources().footprint().readOnly().length`.

***

### readWriteEntries

> **readWriteEntries**: `number`

Defined in: [fee-estimator/fee-estimator.types.ts:125](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L125)

Number of read-write ledger entries accessed in the invocation footprint.
Sourced from `sim.transactionData.resources().footprint().readWrite().length`.

***

### resourceFeeStroops

> **resourceFeeStroops**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:95](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L95)

Total resource fee charged for Soroban execution (CPU + memory + ledger I/O + bandwidth).
Sourced directly from `simulateTransaction` → `minResourceFee`.

***

### writeBytes

> **writeBytes**: `number`

Defined in: [fee-estimator/fee-estimator.types.ts:113](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L113)

Bytes written to disk (state) during the invocation.
Sourced from `sim.transactionData.resources().writeBytes()`.

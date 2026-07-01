[**Tikka SDK v0.1.0**](../README.md)

***

[Tikka SDK](../modules.md) / index.read

# index.read

**@tikka/sdk/read** — Read-only sub-path export for @tikka/sdk.

Contains only the utilities needed to query raffle state from the Soroban
contract and the Stellar network.  No signing, no wallet adapters, no
submission code is included, so bundlers (Vite, Webpack, esbuild) can
tree-shake the write path entirely.

## Included
- `RpcService` — Soroban RPC client (simulate, getLedger, getTransaction)
- `HorizonService` — Horizon account / fee queries
- `NetworkConfig`, `RpcConfig`, `TESTNET_CONFIG`, `MAINNET_CONFIG`
- `ContractFn`, `RaffleStatus` — contract constants (no signing deps)
- `ContractResponse` — shared response envelope type
- Read-only types: `RaffleData`, `UserParticipation`, `GetParticipationParams`,
  `GetUserTicketsParams`, `AssetDescriptor`
- Utils: formatting, validation, errors, retry, BigNumber

## Excluded
- `ContractService` (requires wallet + TransactionBuilder)
- `TransactionLifecycle` (requires wallet + signing)
- All wallet adapters (Freighter, XBull, Albedo, LOBSTR, Rabet)
- `sep10` auth helpers
- `FeeEstimatorService`
- Write-side service classes (`RaffleService`, `TicketService`, `UserService`)
- NestJS modules

## Example

```ts
import { RpcService, RaffleStatus, ContractFn } from '@tikka/sdk/read';
```

## Classes

- [ReadOnlyRaffleService](classes/ReadOnlyRaffleService.md)
- [ReadOnlyUserService](classes/ReadOnlyUserService.md)

## Interfaces

- [ContractResponse](interfaces/ContractResponse.md)

## References

### assertNonEmpty

Re-exports [assertNonEmpty](../index/functions/assertNonEmpty.md)

***

### assertPositiveInt

Re-exports [assertPositiveInt](../index/functions/assertPositiveInt.md)

***

### assertSafeAmount

Re-exports [assertSafeAmount](../index/functions/assertSafeAmount.md)

***

### assertValidPublicKey

Re-exports [assertValidPublicKey](../index/functions/assertValidPublicKey.md)

***

### AssetDescriptor

Re-exports [AssetDescriptor](../index/interfaces/AssetDescriptor.md)

***

### ContractFailureError

Re-exports [ContractFailureError](../index/classes/ContractFailureError.md)

***

### ContractFn

Re-exports [ContractFn](../index/variables/ContractFn.md)

***

### DEFAULT\_RPC\_CONFIG

Re-exports [DEFAULT_RPC_CONFIG](../index/variables/DEFAULT_RPC_CONFIG.md)

***

### formatAddress

Re-exports [formatAddress](../index/variables/formatAddress.md)

***

### formatContractResponse

Re-exports [formatContractResponse](../index/functions/formatContractResponse.md)

***

### GetParticipationParams

Re-exports [GetParticipationParams](../index/interfaces/GetParticipationParams.md)

***

### GetUserTicketsParams

Re-exports [GetUserTicketsParams](../index/interfaces/GetUserTicketsParams.md)

***

### HorizonService

Re-exports [HorizonService](../index/classes/HorizonService.md)

***

### InvalidResponseError

Re-exports [InvalidResponseError](../index/classes/InvalidResponseError.md)

***

### isValidAddress

Re-exports [isValidAddress](../index/functions/isValidAddress.md)

***

### multiplyAmountByQuantity

Re-exports [multiplyAmountByQuantity](../index/functions/multiplyAmountByQuantity.md)

***

### NetworkConfig

Re-exports [NetworkConfig](../index/interfaces/NetworkConfig.md)

***

### normalizeAmount

Re-exports [normalizeAmount](../index/functions/normalizeAmount.md)

***

### RaffleData

Re-exports [RaffleData](../index/interfaces/RaffleData.md)

***

### RaffleStatus

Re-exports [RaffleStatus](../index/enumerations/RaffleStatus.md)

***

### RateLimitError

Re-exports [RateLimitError](../index/classes/RateLimitError.md)

***

### resolveNetworkConfig

Re-exports [resolveNetworkConfig](../index/functions/resolveNetworkConfig.md)

***

### RetryOptions

Re-exports [RetryOptions](../index/interfaces/RetryOptions.md)

***

### RpcConfig

Re-exports [RpcConfig](../index/interfaces/RpcConfig.md)

***

### RpcError

Re-exports [RpcError](../index/classes/RpcError.md)

***

### RpcService

Re-exports [RpcService](../index/classes/RpcService.md)

***

### RpcTimeoutError

Re-exports [RpcTimeoutError](../index/classes/RpcTimeoutError.md)

***

### stroopsToXlm

Re-exports [stroopsToXlm](../index/functions/stroopsToXlm.md)

***

### TikkaNetwork

Re-exports [TikkaNetwork](../index/type-aliases/TikkaNetwork.md)

***

### TikkaSdkError

Re-exports [TikkaSdkError](../index/classes/TikkaSdkError.md)

***

### TikkaSdkErrorCode

Re-exports [TikkaSdkErrorCode](../index/enumerations/TikkaSdkErrorCode.md)

***

### truncateAddress

Re-exports [truncateAddress](../index/functions/truncateAddress.md)

***

### UnavailableError

Re-exports [UnavailableError](../index/classes/UnavailableError.md)

***

### UserParticipation

Re-exports [UserParticipation](../index/interfaces/UserParticipation.md)

***

### validateAddress

Re-exports [validateAddress](../index/variables/validateAddress.md)

***

### validateQuantity

Re-exports [validateQuantity](../index/functions/validateQuantity.md)

***

### validateRaffleId

Re-exports [validateRaffleId](../index/functions/validateRaffleId.md)

***

### withRetry

Re-exports [withRetry](../index/functions/withRetry.md)

***

### xlmToStroops

Re-exports [xlmToStroops](../index/functions/xlmToStroops.md)

## Type Aliases

- [ContractFnName](type-aliases/ContractFnName.md)

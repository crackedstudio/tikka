[**Tikka SDK v0.1.0**](../README.md)

***

[Tikka SDK](../modules.md) / index.write

# index.write

**@tikka/sdk/write** — Write (signing + submission) sub-path export for @tikka/sdk.

Contains everything needed to build, sign, and submit Soroban transactions.
Consumers who only need read-only queries should import from `@tikka/sdk/read`
instead to avoid pulling in wallet adapter and signing overhead.

## Included
- `ContractService` — full invoke / simulate / buildUnsigned / submitSigned
- `TransactionLifecycle` — four-phase lifecycle (simulate → sign → submit → poll)
- All wallet adapters (Freighter, XBull, Albedo, LOBSTR, Rabet, Mock)
- `WalletAdapter` interface
- `sep10` auth helpers (`buildChallenge`, `verifyResponse`, `createInMemoryNonceStore`)
- `FeeEstimatorService`
- Write-side service classes (`RaffleService`, `TicketService`, `UserService`)
- All write-side types (`RaffleParams`, `BuyTicketParams`, `RefundTicketParams`, etc.)
- Re-exports everything from `@tikka/sdk/read` for convenience

## Example

```ts
import { ContractService, FreighterAdapter } from '@tikka/sdk/write';
```

## Classes

- [ContractService](classes/ContractService.md)

## Interfaces

- [InvokeOptions](interfaces/InvokeOptions.md)
- [UnsignedTxResult](interfaces/UnsignedTxResult.md)

## References

### AlbedoAdapter

Re-exports [AlbedoAdapter](../index/classes/AlbedoAdapter.md)

***

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

### BatchPurchaseResult

Re-exports [BatchPurchaseResult](../index/interfaces/BatchPurchaseResult.md)

***

### BatchTicketPurchase

Re-exports [BatchTicketPurchase](../index/interfaces/BatchTicketPurchase.md)

***

### buildChallenge

Re-exports [buildChallenge](../index/functions/buildChallenge.md)

***

### BuildChallengeOptions

Re-exports [BuildChallengeOptions](../index/interfaces/BuildChallengeOptions.md)

***

### BuyBatchParams

Re-exports [BuyBatchParams](../index/interfaces/BuyBatchParams.md)

***

### BuyBatchResult

Re-exports [BuyBatchResult](../index/interfaces/BuyBatchResult.md)

***

### BuyTicketParams

Re-exports [BuyTicketParams](../index/interfaces/BuyTicketParams.md)

***

### BuyTicketResult

Re-exports [BuyTicketResult](../index/interfaces/BuyTicketResult.md)

***

### CancelRaffleParams

Re-exports [CancelRaffleParams](../index/interfaces/CancelRaffleParams.md)

***

### CancelRaffleResult

Re-exports [CancelRaffleResult](../index/interfaces/CancelRaffleResult.md)

***

### ChallengeCreationOptions

Re-exports [ChallengeCreationOptions](../index/type-aliases/ChallengeCreationOptions.md)

***

### ChallengeVerificationOptions

Re-exports [ChallengeVerificationOptions](../index/type-aliases/ChallengeVerificationOptions.md)

***

### ContractFailureError

Re-exports [ContractFailureError](../index/classes/ContractFailureError.md)

***

### ContractFn

Re-exports [ContractFn](../index/variables/ContractFn.md)

***

### ContractFnName

Re-exports [ContractFnName](../index.read/type-aliases/ContractFnName.md)

***

### ContractResponse

Re-exports [ContractResponse](../index.read/interfaces/ContractResponse.md)

***

### createInMemoryNonceStore

Re-exports [createInMemoryNonceStore](../index/functions/createInMemoryNonceStore.md)

***

### CreateRaffleEstimate

Re-exports [CreateRaffleEstimate](../index/interfaces/CreateRaffleEstimate.md)

***

### CreateRaffleResult

Re-exports [CreateRaffleResult](../index/interfaces/CreateRaffleResult.md)

***

### DEFAULT\_RPC\_CONFIG

Re-exports [DEFAULT_RPC_CONFIG](../index/variables/DEFAULT_RPC_CONFIG.md)

***

### EstimateFeeParams

Re-exports [EstimateFeeParams](../index/interfaces/EstimateFeeParams.md)

***

### FeeEstimateResult

Re-exports [FeeEstimateResult](../index/interfaces/FeeEstimateResult.md)

***

### FeeEstimatorModule

Re-exports [FeeEstimatorModule](../index/classes/FeeEstimatorModule.md)

***

### FeeEstimatorService

Re-exports [FeeEstimatorService](../index/classes/FeeEstimatorService.md)

***

### FeeQuote

Re-exports [FeeQuote](../index/interfaces/FeeQuote.md)

***

### FeeQuoteConfidence

Re-exports [FeeQuoteConfidence](../index/type-aliases/FeeQuoteConfidence.md)

***

### FeeQuoteSource

Re-exports [FeeQuoteSource](../index/type-aliases/FeeQuoteSource.md)

***

### FeeQuoteWarning

Re-exports [FeeQuoteWarning](../index/interfaces/FeeQuoteWarning.md)

***

### FeeResourceBreakdown

Re-exports [FeeResourceBreakdown](../index/interfaces/FeeResourceBreakdown.md)

***

### formatAddress

Re-exports [formatAddress](../index/variables/formatAddress.md)

***

### formatContractResponse

Re-exports [formatContractResponse](../index/functions/formatContractResponse.md)

***

### FreighterAdapter

Re-exports [FreighterAdapter](../index/classes/FreighterAdapter.md)

***

### GetFeeQuoteParams

Re-exports [GetFeeQuoteParams](../index/interfaces/GetFeeQuoteParams.md)

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

### InvokeLifecycleOptions

Re-exports [InvokeLifecycleOptions](../index/interfaces/InvokeLifecycleOptions.md)

***

### isValidAddress

Re-exports [isValidAddress](../index/functions/isValidAddress.md)

***

### LobstrAdapter

Re-exports [LobstrAdapter](../index/classes/LobstrAdapter.md)

***

### MockWalletAdapter

Re-exports [MockWalletAdapter](../index/classes/MockWalletAdapter.md)

***

### MockWalletOptions

Re-exports [MockWalletOptions](../index/interfaces/MockWalletOptions.md)

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

### PollConfig

Re-exports [PollConfig](../index/interfaces/PollConfig.md)

***

### RabetAdapter

Re-exports [RabetAdapter](../index/classes/RabetAdapter.md)

***

### RaffleData

Re-exports [RaffleData](../index/interfaces/RaffleData.md)

***

### RaffleParams

Re-exports [RaffleParams](../index/interfaces/RaffleParams.md)

***

### RaffleService

Re-exports [RaffleService](../index/classes/RaffleService.md)

***

### RaffleStatus

Re-exports [RaffleStatus](../index/enumerations/RaffleStatus.md)

***

### RateLimitError

Re-exports [RateLimitError](../index/classes/RateLimitError.md)

***

### ReadOnlyRaffleService

Re-exports [ReadOnlyRaffleService](../index.read/classes/ReadOnlyRaffleService.md)

***

### ReadOnlyUserService

Re-exports [ReadOnlyUserService](../index.read/classes/ReadOnlyUserService.md)

***

### RefundTicketParams

Re-exports [RefundTicketParams](../index/interfaces/RefundTicketParams.md)

***

### RefundTicketResult

Re-exports [RefundTicketResult](../index/interfaces/RefundTicketResult.md)

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

### Sep10VerificationError

Re-exports [Sep10VerificationError](../index/classes/Sep10VerificationError.md)

***

### Sep10VerificationErrorCode

Re-exports [Sep10VerificationErrorCode](../index/enumerations/Sep10VerificationErrorCode.md)

***

### SignTransactionResult

Re-exports [SignTransactionResult](../index/interfaces/SignTransactionResult.md)

***

### SimulateResult

Re-exports [SimulateResult](../index/interfaces/SimulateResult.md)

***

### stroopsToXlm

Re-exports [stroopsToXlm](../index/functions/stroopsToXlm.md)

***

### SubmitResult

Re-exports [SubmitResult](../index/interfaces/SubmitResult.md)

***

### TicketService

Re-exports [TicketService](../index/classes/TicketService.md)

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

### TransactionLifecycle

Re-exports [TransactionLifecycle](../index/classes/TransactionLifecycle.md)

***

### truncateAddress

Re-exports [truncateAddress](../index/functions/truncateAddress.md)

***

### TxMemo

Re-exports [TxMemo](../index/type-aliases/TxMemo.md)

***

### UnavailableError

Re-exports [UnavailableError](../index/classes/UnavailableError.md)

***

### UserParticipation

Re-exports [UserParticipation](../index/interfaces/UserParticipation.md)

***

### UserService

Re-exports [UserService](../index/classes/UserService.md)

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

### verifyResponse

Re-exports [verifyResponse](../index/functions/verifyResponse.md)

***

### VerifyResponseOptions

Re-exports [VerifyResponseOptions](../index/interfaces/VerifyResponseOptions.md)

***

### WalletAdapter

Re-exports [WalletAdapter](../index/classes/WalletAdapter.md)

***

### WalletAdapterOptions

Re-exports [WalletAdapterOptions](../index/interfaces/WalletAdapterOptions.md)

***

### WalletCapabilities

Re-exports [WalletCapabilities](../index/interfaces/WalletCapabilities.md)

***

### WalletName

Re-exports [WalletName](../index/enumerations/WalletName.md)

***

### withRetry

Re-exports [withRetry](../index/functions/withRetry.md)

***

### XBullAdapter

Re-exports [XBullAdapter](../index/classes/XBullAdapter.md)

***

### xlmToStroops

Re-exports [xlmToStroops](../index/functions/xlmToStroops.md)

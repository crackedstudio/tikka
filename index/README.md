[**Tikka SDK v0.1.0**](../README.md)

***

[Tikka SDK](../modules.md) / index

# index

**@tikka/sdk** — NestJS SDK for interacting with the Tikka Soroban raffle contract on Stellar.

## Modules
- **Raffle** — create, fetch, list, and cancel raffles
- **Ticket** — buy and refund tickets; query user holdings
- **Wallet** — browser wallet adapters (Freighter, XBull, Albedo, LOBSTR, Rabet)
- **User** — query on-chain participation data
- **Admin** — pause/unpause contract and manage admin rights
- **Network** — RPC / Horizon service configuration
- **Fee Estimator** — estimate transaction fees before signing
- **Utils** — formatting, validation, error classes
- **Auth** — SEP-10 challenge/verification for wallet authentication

## Example

```ts
import { RaffleService, TicketService, FreighterAdapter } from '@tikka/sdk';
```

## Classes

### Admin

- [AdminService](classes/AdminService.md)

### Other

- [AdminModule](classes/AdminModule.md)
- [AlbedoAdapter](classes/AlbedoAdapter.md)
- [ContractFailureError](classes/ContractFailureError.md)
- [FeeEstimatorModule](classes/FeeEstimatorModule.md)
- [FeeEstimatorService](classes/FeeEstimatorService.md)
- [FreighterAdapter](classes/FreighterAdapter.md)
- [HorizonService](classes/HorizonService.md)
- [InvalidResponseError](classes/InvalidResponseError.md)
- [LobstrAdapter](classes/LobstrAdapter.md)
- [MockRpcService](classes/MockRpcService.md)
- [NetworkModule](classes/NetworkModule.md)
- [RabetAdapter](classes/RabetAdapter.md)
- [RaffleModule](classes/RaffleModule.md)
- [RaffleService](classes/RaffleService.md)
- [RaffleStateError](classes/RaffleStateError.md)
- [RateLimitError](classes/RateLimitError.md)
- [RpcError](classes/RpcError.md)
- [RpcService](classes/RpcService.md)
- [RpcTimeoutError](classes/RpcTimeoutError.md)
- [Sep10VerificationError](classes/Sep10VerificationError.md)
- [TicketModule](classes/TicketModule.md)
- [TicketService](classes/TicketService.md)
- [TikkaSdkError](classes/TikkaSdkError.md)
- [TransactionLifecycle](classes/TransactionLifecycle.md)
- [UnavailableError](classes/UnavailableError.md)
- [UserModule](classes/UserModule.md)
- [WalletAdapter](classes/WalletAdapter.md)
- [XBullAdapter](classes/XBullAdapter.md)

### User

- [UserService](classes/UserService.md)

### Wallet

- [MockWalletAdapter](classes/MockWalletAdapter.md)

## Enumerations

- [RaffleStatus](enumerations/RaffleStatus.md)
- [Sep10VerificationErrorCode](enumerations/Sep10VerificationErrorCode.md)
- [TikkaSdkErrorCode](enumerations/TikkaSdkErrorCode.md)
- [WalletName](enumerations/WalletName.md)

## Functions

- [assertNonEmpty](functions/assertNonEmpty.md)
- [assertPositiveInt](functions/assertPositiveInt.md)
- [assertSafeAmount](functions/assertSafeAmount.md)
- [assertValidPublicKey](functions/assertValidPublicKey.md)
- [buildChallenge](functions/buildChallenge.md)
- [createInMemoryNonceStore](functions/createInMemoryNonceStore.md)
- [formatContractResponse](functions/formatContractResponse.md)
- [isValidAddress](functions/isValidAddress.md)
- [multiplyAmountByQuantity](functions/multiplyAmountByQuantity.md)
- [normalizeAmount](functions/normalizeAmount.md)
- [resolveNetworkConfig](functions/resolveNetworkConfig.md)
- [stroopsToXlm](functions/stroopsToXlm.md)
- [truncateAddress](functions/truncateAddress.md)
- [validateQuantity](functions/validateQuantity.md)
- [validateRaffleId](functions/validateRaffleId.md)
- [verifyResponse](functions/verifyResponse.md)
- [withRetry](functions/withRetry.md)
- [xlmToStroops](functions/xlmToStroops.md)

## Interfaces

### Admin

- [AcceptAdminResult](interfaces/AcceptAdminResult.md)
- [AdminWriteOptions](interfaces/AdminWriteOptions.md)
- [PauseResult](interfaces/PauseResult.md)
- [TransferAdminResult](interfaces/TransferAdminResult.md)
- [UnpauseResult](interfaces/UnpauseResult.md)

### Other

- [AssetDescriptor](interfaces/AssetDescriptor.md)
- [BatchPurchaseResult](interfaces/BatchPurchaseResult.md)
- [BatchTicketPurchase](interfaces/BatchTicketPurchase.md)
- [BuildChallengeOptions](interfaces/BuildChallengeOptions.md)
- [BuyBatchParams](interfaces/BuyBatchParams.md)
- [BuyBatchResult](interfaces/BuyBatchResult.md)
- [BuyTicketParams](interfaces/BuyTicketParams.md)
- [BuyTicketResult](interfaces/BuyTicketResult.md)
- [BuyTicketsParams](interfaces/BuyTicketsParams.md)
- [CancelRaffleParams](interfaces/CancelRaffleParams.md)
- [CancelRaffleResult](interfaces/CancelRaffleResult.md)
- [ClaimPrizeParams](interfaces/ClaimPrizeParams.md)
- [ClaimPrizeResult](interfaces/ClaimPrizeResult.md)
- [CreateRaffleEstimate](interfaces/CreateRaffleEstimate.md)
- [CreateRaffleResult](interfaces/CreateRaffleResult.md)
- [EstimateFeeParams](interfaces/EstimateFeeParams.md)
- [FeeEstimateResult](interfaces/FeeEstimateResult.md)
- [FeeQuote](interfaces/FeeQuote.md)
- [FeeQuoteWarning](interfaces/FeeQuoteWarning.md)
- [FeeResourceBreakdown](interfaces/FeeResourceBreakdown.md)
- [GetFeeQuoteParams](interfaces/GetFeeQuoteParams.md)
- [GetUserActivityParams](interfaces/GetUserActivityParams.md)
- [GetUserTicketsParams](interfaces/GetUserTicketsParams.md)
- [InvokeLifecycleOptions](interfaces/InvokeLifecycleOptions.md)
- [MockRpcBehavior](interfaces/MockRpcBehavior.md)
- [NetworkConfig](interfaces/NetworkConfig.md)
- [PollConfig](interfaces/PollConfig.md)
- [RaffleData](interfaces/RaffleData.md)
- [RaffleParams](interfaces/RaffleParams.md)
- [RefundTicketParams](interfaces/RefundTicketParams.md)
- [RefundTicketResult](interfaces/RefundTicketResult.md)
- [RetryOptions](interfaces/RetryOptions.md)
- [RpcConfig](interfaces/RpcConfig.md)
- [SignTransactionResult](interfaces/SignTransactionResult.md)
- [SimulateResult](interfaces/SimulateResult.md)
- [SubmitResult](interfaces/SubmitResult.md)
- [TriggerDrawParams](interfaces/TriggerDrawParams.md)
- [TriggerDrawResult](interfaces/TriggerDrawResult.md)
- [UserActivitySummary](interfaces/UserActivitySummary.md)
- [UserParticipation](interfaces/UserParticipation.md)
- [UserRaffleActivity](interfaces/UserRaffleActivity.md)
- [UserTicket](interfaces/UserTicket.md)
- [VerifyResponseOptions](interfaces/VerifyResponseOptions.md)
- [WalletAdapterOptions](interfaces/WalletAdapterOptions.md)
- [WalletCapabilities](interfaces/WalletCapabilities.md)
- [WinnerResult](interfaces/WinnerResult.md)
- [WinningEntry](interfaces/WinningEntry.md)

### User

- [GetParticipationParams](interfaces/GetParticipationParams.md)

### Wallet

Useful for testing and development scenarios where you need
deterministic wallet behavior without requiring a real extension.

- [MockWalletOptions](interfaces/MockWalletOptions.md)

## Type Aliases

- [ChallengeCreationOptions](type-aliases/ChallengeCreationOptions.md)
- [ChallengeVerificationOptions](type-aliases/ChallengeVerificationOptions.md)
- [FeeQuoteConfidence](type-aliases/FeeQuoteConfidence.md)
- [FeeQuoteSource](type-aliases/FeeQuoteSource.md)
- [RaffleTransition](type-aliases/RaffleTransition.md)
- [TikkaNetwork](type-aliases/TikkaNetwork.md)
- [TxMemo](type-aliases/TxMemo.md)
- [TxResponse](type-aliases/TxResponse.md)

## Variables

- [ContractFn](variables/ContractFn.md)
- [DEFAULT\_RPC\_CONFIG](variables/DEFAULT_RPC_CONFIG.md)
- [formatAddress](variables/formatAddress.md)
- [SOROBAN\_RPC\_BASE\_DELAY\_MS](variables/SOROBAN_RPC_BASE_DELAY_MS.md)
- [SOROBAN\_RPC\_MAX\_RETRIES](variables/SOROBAN_RPC_MAX_RETRIES.md)
- [TICKET\_CONSTRAINTS](variables/TICKET_CONSTRAINTS.md)
- [validateAddress](variables/validateAddress.md)

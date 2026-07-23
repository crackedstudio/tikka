[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TikkaSdkErrorCode

# Enumeration: TikkaSdkErrorCode

Defined in: [utils/errors.ts:36](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L36)

SDK-wide error codes exactly as required by Issue #154

## Enumeration Members

### ContractError

> **ContractError**: `"CONTRACT_ERROR"`

Defined in: [utils/errors.ts:50](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L50)

Contract returned an error

***

### ContractFailure

> **ContractFailure**: `"CONTRACT_FAILURE"`

Defined in: [utils/errors.ts:62](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L62)

Contract execution failed

***

### ContractPaused

> **ContractPaused**: `"CONTRACT_PAUSED"`

Defined in: [utils/errors.ts:66](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L66)

Contract is paused — write operations blocked

***

### ExternalContractError

> **ExternalContractError**: `"EXTERNAL_CONTRACT_ERROR"`

Defined in: [utils/errors.ts:72](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L72)

An external/cross-contract call (e.g. SEP-41 token) failed

***

### InsufficientFunds

> **InsufficientFunds**: `"INSUFFICIENT_FUNDS"`

Defined in: [utils/errors.ts:80](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L80)

Caller does not have sufficient balance to complete the operation

***

### InvalidParams

> **InvalidParams**: `"INVALID_PARAMS"`

Defined in: [utils/errors.ts:48](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L48)

Invalid parameters supplied (General)

***

### InvalidResponse

> **InvalidResponse**: `"INVALID_RESPONSE"`

Defined in: [utils/errors.ts:60](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L60)

Invalid response format or payload

***

### NetworkError

> **NetworkError**: `"NetworkError"`

Defined in: [utils/errors.ts:52](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L52)

Network / RPC unreachable

***

### RaffleEnded

> **RaffleEnded**: `"RAFFLE_ENDED"`

Defined in: [utils/errors.ts:74](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L74)

Raffle is not in a state that permits the requested operation

***

### RaffleFull

> **RaffleFull**: `"RAFFLE_FULL"`

Defined in: [utils/errors.ts:78](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L78)

Raffle has reached its maximum ticket capacity

***

### RaffleNotFound

> **RaffleNotFound**: `"RAFFLE_NOT_FOUND"`

Defined in: [utils/errors.ts:76](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L76)

Raffle ID does not correspond to an existing raffle

***

### RateLimit

> **RateLimit**: `"RATE_LIMIT"`

Defined in: [utils/errors.ts:56](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L56)

Rate limit exceeded

***

### SimulationFailed

> **SimulationFailed**: `"SimulationFailed"`

Defined in: [utils/errors.ts:44](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L44)

Transaction simulation failed

***

### SubmissionFailed

> **SubmissionFailed**: `"SUBMISSION_FAILED"`

Defined in: [utils/errors.ts:46](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L46)

Transaction submission failed

***

### Timeout

> **Timeout**: `"TIMEOUT"`

Defined in: [utils/errors.ts:54](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L54)

Timeout while waiting for confirmation

***

### Unauthorized

> **Unauthorized**: `"UNAUTHORIZED"`

Defined in: [utils/errors.ts:68](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L68)

Caller is not authorized for this operation

***

### Unavailable

> **Unavailable**: `"UNAVAILABLE"`

Defined in: [utils/errors.ts:58](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L58)

Service unavailable

***

### Unknown

> **Unknown**: `"UNKNOWN"`

Defined in: [utils/errors.ts:64](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L64)

Unknown / catch-all

***

### UserRejected

> **UserRejected**: `"UserRejected"`

Defined in: [utils/errors.ts:42](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L42)

User rejected the transaction / signature request

***

### ValidationError

> **ValidationError**: `"ValidationError"`

Defined in: [utils/errors.ts:70](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L70)

Validation failed for input parameters (raffleId, quantity, etc.)

***

### WalletNotConnected

> **WalletNotConnected**: `"WALLET_NOT_CONNECTED"`

Defined in: [utils/errors.ts:38](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L38)

Wallet extension installed but not connected/authorized

***

### WalletNotInstalled

> **WalletNotInstalled**: `"WALLET_NOT_INSTALLED"`

Defined in: [utils/errors.ts:40](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L40)

No compatible wallet extension is installed in the browser

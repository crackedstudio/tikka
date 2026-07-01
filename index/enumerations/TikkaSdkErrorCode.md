[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TikkaSdkErrorCode

# Enumeration: TikkaSdkErrorCode

Defined in: [utils/errors.ts:36](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L36)

SDK-wide error codes exactly as required by Issue #154

## Enumeration Members

### ContractError

> **ContractError**: `"CONTRACT_ERROR"`

Defined in: [utils/errors.ts:48](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L48)

Contract returned an error

***

### ContractFailure

> **ContractFailure**: `"CONTRACT_FAILURE"`

Defined in: [utils/errors.ts:60](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L60)

Contract execution failed

***

### ContractPaused

> **ContractPaused**: `"CONTRACT_PAUSED"`

Defined in: [utils/errors.ts:64](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L64)

Contract is paused — write operations blocked

***

### ExternalContractError

> **ExternalContractError**: `"EXTERNAL_CONTRACT_ERROR"`

Defined in: [utils/errors.ts:70](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L70)

An external/cross-contract call (e.g. SEP-41 token) failed

***

### InvalidParams

> **InvalidParams**: `"INVALID_PARAMS"`

Defined in: [utils/errors.ts:46](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L46)

Invalid parameters supplied (General)

***

### InvalidResponse

> **InvalidResponse**: `"INVALID_RESPONSE"`

Defined in: [utils/errors.ts:58](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L58)

Invalid response format or payload

***

### NetworkError

> **NetworkError**: `"NetworkError"`

Defined in: [utils/errors.ts:50](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L50)

Network / RPC unreachable

***

### RateLimit

> **RateLimit**: `"RATE_LIMIT"`

Defined in: [utils/errors.ts:54](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L54)

Rate limit exceeded

***

### SimulationFailed

> **SimulationFailed**: `"SimulationFailed"`

Defined in: [utils/errors.ts:42](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L42)

Transaction simulation failed

***

### SubmissionFailed

> **SubmissionFailed**: `"SUBMISSION_FAILED"`

Defined in: [utils/errors.ts:44](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L44)

Transaction submission failed

***

### Timeout

> **Timeout**: `"TIMEOUT"`

Defined in: [utils/errors.ts:52](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L52)

Timeout while waiting for confirmation

***

### Unauthorized

> **Unauthorized**: `"UNAUTHORIZED"`

Defined in: [utils/errors.ts:66](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L66)

Caller is not authorized for this operation

***

### Unavailable

> **Unavailable**: `"UNAVAILABLE"`

Defined in: [utils/errors.ts:56](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L56)

Service unavailable

***

### Unknown

> **Unknown**: `"UNKNOWN"`

Defined in: [utils/errors.ts:62](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L62)

Unknown / catch-all

***

### UserRejected

> **UserRejected**: `"UserRejected"`

Defined in: [utils/errors.ts:40](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L40)

User rejected the transaction / signature request

***

### ValidationError

> **ValidationError**: `"ValidationError"`

Defined in: [utils/errors.ts:68](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L68)

Validation failed for input parameters (raffleId, quantity, etc.)

***

### WalletNotConnected

> **WalletNotConnected**: `"WALLET_NOT_CONNECTED"`

Defined in: [utils/errors.ts:38](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L38)

Wallet extension installed but not connected/authorized

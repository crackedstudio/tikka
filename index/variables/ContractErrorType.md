[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / ContractErrorType

# Variable: ContractErrorType

> `const` **ContractErrorType**: `object`

Defined in: [utils/errors.ts:178](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L178)

Contract-level error identifiers.
Values are aliases of the corresponding `TikkaSdkErrorCode` members so
`err.code` comparisons work against either enum interchangeably.

## Type Declaration

### INSUFFICIENT\_FUNDS

> `readonly` **INSUFFICIENT\_FUNDS**: [`InsufficientFunds`](../enumerations/TikkaSdkErrorCode.md#insufficientfunds) = `TikkaSdkErrorCode.InsufficientFunds`

### RAFFLE\_ENDED

> `readonly` **RAFFLE\_ENDED**: [`RaffleEnded`](../enumerations/TikkaSdkErrorCode.md#raffleended) = `TikkaSdkErrorCode.RaffleEnded`

### RAFFLE\_FULL

> `readonly` **RAFFLE\_FULL**: [`RaffleFull`](../enumerations/TikkaSdkErrorCode.md#rafflefull) = `TikkaSdkErrorCode.RaffleFull`

### RAFFLE\_NOT\_FOUND

> `readonly` **RAFFLE\_NOT\_FOUND**: [`RaffleNotFound`](../enumerations/TikkaSdkErrorCode.md#rafflenotfound) = `TikkaSdkErrorCode.RaffleNotFound`

### UNAUTHORIZED

> `readonly` **UNAUTHORIZED**: [`Unauthorized`](../enumerations/TikkaSdkErrorCode.md#unauthorized) = `TikkaSdkErrorCode.Unauthorized`

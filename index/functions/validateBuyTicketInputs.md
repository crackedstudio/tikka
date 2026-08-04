[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / validateBuyTicketInputs

# Function: validateBuyTicketInputs()

> **validateBuyTicketInputs**(`params`): `void`

Defined in: [modules/ticket/purchase-validation.ts:114](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/purchase-validation.ts#L114)

Module-boundary validation for a single `buy` purchase.
Must run before any simulate/invoke so invalid inputs never build transactions.

## Parameters

### params

#### quantity

`number`

#### raffleId

`number`

## Returns

`void`

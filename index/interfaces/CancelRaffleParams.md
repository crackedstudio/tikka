[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / CancelRaffleParams

# Interface: CancelRaffleParams

Defined in: [modules/raffle/raffle.types.ts:84](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L84)

Parameters for cancelling a raffle.

## Properties

### memo?

> `optional` **memo?**: [`TxMemo`](../type-aliases/TxMemo.md)

Defined in: [modules/raffle/raffle.types.ts:90](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L90)

Optional transaction memo for tracking or external integrations.
Supports text (≤28 bytes), numeric id, or 32-byte hash.

***

### raffleId

> **raffleId**: `number`

Defined in: [modules/raffle/raffle.types.ts:85](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L85)

[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RaffleData

# Interface: RaffleData

Defined in: [modules/raffle/raffle.types.ts:58](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L58)

On-chain raffle data.

## Properties

### allowMultiple

> **allowMultiple**: `boolean`

Defined in: [modules/raffle/raffle.types.ts:70](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L70)

***

### asset

> **asset**: `string`

Defined in: [modules/raffle/raffle.types.ts:67](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L67)

Resolved asset code, e.g. "XLM" or "USDC"

***

### assetIssuer?

> `optional` **assetIssuer?**: `string`

Defined in: [modules/raffle/raffle.types.ts:69](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L69)

Issuer account when asset is non-native

***

### creator

> **creator**: `string`

Defined in: [modules/raffle/raffle.types.ts:60](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L60)

***

### endTime

> **endTime**: `number`

Defined in: [modules/raffle/raffle.types.ts:65](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L65)

***

### maxTickets

> **maxTickets**: `number`

Defined in: [modules/raffle/raffle.types.ts:63](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L63)

***

### metadataCid

> **metadataCid**: `string`

Defined in: [modules/raffle/raffle.types.ts:71](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L71)

***

### prizeAmount?

> `optional` **prizeAmount?**: `string`

Defined in: [modules/raffle/raffle.types.ts:74](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L74)

***

### raffleId

> **raffleId**: `number`

Defined in: [modules/raffle/raffle.types.ts:59](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L59)

***

### status

> **status**: [`RaffleStatus`](../enumerations/RaffleStatus.md)

Defined in: [modules/raffle/raffle.types.ts:61](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L61)

***

### ticketPrice

> **ticketPrice**: `string`

Defined in: [modules/raffle/raffle.types.ts:62](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L62)

***

### ticketsSold

> **ticketsSold**: `number`

Defined in: [modules/raffle/raffle.types.ts:64](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L64)

***

### winner?

> `optional` **winner?**: `string`

Defined in: [modules/raffle/raffle.types.ts:72](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L72)

***

### winningTicketId?

> `optional` **winningTicketId?**: `number`

Defined in: [modules/raffle/raffle.types.ts:73](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/raffle/raffle.types.ts#L73)

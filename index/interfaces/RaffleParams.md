[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RaffleParams

# Interface: RaffleParams

Defined in: [modules/raffle/raffle.types.ts:16](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L16)

Parameters for creating a new raffle.

## Properties

### allowMultiple

> **allowMultiple**: `boolean`

Defined in: [modules/raffle/raffle.types.ts:32](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L32)

Whether a single address can buy multiple tickets

***

### asset

> **asset**: `string` \| [`AssetDescriptor`](AssetDescriptor.md)

Defined in: [modules/raffle/raffle.types.ts:26](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L26)

Asset used for ticket pricing.
Accepts either a plain asset code string (e.g. "XLM") for backwards
compatibility, or a structured `AssetDescriptor` for non-native assets.

#### Example

```ts
{ code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' }
```

***

### endTime

> **endTime**: `number`

Defined in: [modules/raffle/raffle.types.ts:30](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L30)

Raffle end time — Unix timestamp in milliseconds

***

### maxTickets

> **maxTickets**: `number`

Defined in: [modules/raffle/raffle.types.ts:28](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L28)

Maximum number of tickets

***

### memo?

> `optional` **memo?**: [`TxMemo`](../type-aliases/TxMemo.md)

Defined in: [modules/raffle/raffle.types.ts:39](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L39)

Optional transaction memo for tracking or external integrations.
Supports text (≤28 bytes), numeric id, or 32-byte hash.

***

### metadataCid?

> `optional` **metadataCid?**: `string`

Defined in: [modules/raffle/raffle.types.ts:34](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L34)

IPFS CID linking to off-chain metadata (title, image, etc.)

***

### ticketPrice

> **ticketPrice**: `string`

Defined in: [modules/raffle/raffle.types.ts:18](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.types.ts#L18)

Ticket price amount (string to avoid float precision issues)

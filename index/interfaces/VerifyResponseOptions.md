[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / VerifyResponseOptions

# Interface: VerifyResponseOptions

Defined in: [auth/sep10.ts:21](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L21)

## Properties

### anchorDomain

> **anchorDomain**: `string`

Defined in: [auth/sep10.ts:25](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L25)

***

### clientAccount

> **clientAccount**: `string`

Defined in: [auth/sep10.ts:24](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L24)

***

### maxChallengeAge?

> `optional` **maxChallengeAge?**: `number`

Defined in: [auth/sep10.ts:28](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L28)

***

### networkPassphrase?

> `optional` **networkPassphrase?**: `string`

Defined in: [auth/sep10.ts:26](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L26)

***

### nonceValidator

> **nonceValidator**: (`nonceBase64`) => `boolean` \| `Promise`\<`boolean`\>

Defined in: [auth/sep10.ts:29](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L29)

#### Parameters

##### nonceBase64

`string`

#### Returns

`boolean` \| `Promise`\<`boolean`\>

***

### now?

> `optional` **now?**: `number`

Defined in: [auth/sep10.ts:27](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L27)

***

### serverAccount

> **serverAccount**: `string`

Defined in: [auth/sep10.ts:23](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L23)

***

### signedChallenge

> **signedChallenge**: `string`

Defined in: [auth/sep10.ts:22](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/auth/sep10.ts#L22)

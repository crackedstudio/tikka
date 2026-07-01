[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / buildChallenge

# Function: buildChallenge()

> **buildChallenge**(`options`): `string`

Defined in: [auth/sep10.ts:136](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/auth/sep10.ts#L136)

Build a SEP-10 challenge transaction.

## Parameters

### options

[`BuildChallengeOptions`](../interfaces/BuildChallengeOptions.md)

BuildChallengeOptions

## Returns

`string`

XDR string for the signed challenge transaction

## Example

```ts
const challengeXdr = buildChallenge({
  serverSecret: process.env.SEP10_SERVER_SECRET,
  clientAccount: clientPublicKey,
  anchorDomain: 'example.com',
  webAuthDomain: 'auth.example.com',
  timeout: 300,
  networkPassphrase: Networks.TESTNET,
});
```

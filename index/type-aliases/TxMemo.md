[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TxMemo

# Type Alias: TxMemo

> **TxMemo** = \{ `type`: `"text"`; `value`: `string`; \} \| \{ `type`: `"id"`; `value`: `string`; \} \| \{ `type`: `"hash"`; `value`: `Buffer`; \}

Defined in: [contract/lifecycle.ts:47](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L47)

Transaction memo — attach tracking data or external references.
Mirrors the three Stellar memo types the protocol supports.

[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / WalletCapabilities

# Interface: WalletCapabilities

Defined in: [wallet/wallet.interface.ts:40](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L40)

Describes which operations a wallet adapter supports.
Used to enable adaptive UI behavior based on wallet capabilities.

Keep these flags honest: never advertise a capability whose method
will throw or no-op.

## Properties

### supportsGetNetwork

> **supportsGetNetwork**: `boolean`

Defined in: [wallet/wallet.interface.ts:63](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L63)

Whether the adapter can retrieve the currently selected network.

#### Default

```ts
false
```

***

### supportsGetPublicKey

> **supportsGetPublicKey**: `boolean`

Defined in: [wallet/wallet.interface.ts:45](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L45)

Whether the adapter supports retrieving the user's public key.

#### Default

```ts
true
```

***

### supportsSignMessage

> **supportsSignMessage**: `boolean`

Defined in: [wallet/wallet.interface.ts:57](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L57)

Whether the adapter supports signing arbitrary messages (SIWS, etc).

#### Default

```ts
false
```

***

### supportsSignTransaction

> **supportsSignTransaction**: `boolean`

Defined in: [wallet/wallet.interface.ts:51](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L51)

Whether the adapter supports signing Soroban transactions.

#### Default

```ts
true
```

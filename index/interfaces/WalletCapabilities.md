[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / WalletCapabilities

# Interface: WalletCapabilities

Defined in: [wallet/wallet.interface.ts:30](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L30)

Describes which operations a wallet adapter supports.
Used to enable adaptive UI behavior based on wallet capabilities.

## Properties

### supportsGetNetwork

> **supportsGetNetwork**: `boolean`

Defined in: [wallet/wallet.interface.ts:53](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L53)

Whether the adapter can retrieve the currently selected network.

#### Default

```ts
false
```

***

### supportsGetPublicKey

> **supportsGetPublicKey**: `boolean`

Defined in: [wallet/wallet.interface.ts:35](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L35)

Whether the adapter supports retrieving the user's public key.

#### Default

```ts
true
```

***

### supportsSignMessage

> **supportsSignMessage**: `boolean`

Defined in: [wallet/wallet.interface.ts:47](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L47)

Whether the adapter supports signing arbitrary messages (SIWS, etc).

#### Default

```ts
false
```

***

### supportsSignTransaction

> **supportsSignTransaction**: `boolean`

Defined in: [wallet/wallet.interface.ts:41](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L41)

Whether the adapter supports signing Soroban transactions.

#### Default

```ts
true
```

[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / MockWalletAdapter

# Class: MockWalletAdapter

Defined in: [wallet/mock-wallet.adapter.ts:70](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L70)

Mock wallet adapter for testing and development.

## Remarks

Provides deterministic responses without requiring a real browser extension.
Useful for unit tests, integration tests, and local development.

Features:
- Configurable public key
- Simulated response delays
- Configurable failures for testing error handling
- No external dependencies

## Example

```ts
// Basic usage
const wallet = new MockWalletAdapter({
  publicKey: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36'
});

// Simulate failures for testing
const walletThatFails = new MockWalletAdapter({
  failSignTransaction: true
});

// Test error handling
try {
  const signed = await walletThatFails.signTransaction(xdr);
} catch (err) {
  console.log('Caught expected error:', err.message);
}
```

## Extends

- [`WalletAdapter`](WalletAdapter.md)

## Constructors

### Constructor

> **new MockWalletAdapter**(`options?`): `MockWalletAdapter`

Defined in: [wallet/mock-wallet.adapter.ts:75](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L75)

#### Parameters

##### options?

[`MockWalletOptions`](../interfaces/MockWalletOptions.md) = `{}`

#### Returns

`MockWalletAdapter`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`constructor`](WalletAdapter.md#constructor)

## Methods

### connect()?

> `optional` **connect**(): `Promise`\<`void`\>

Defined in: [wallet/wallet.interface.ts:74](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L74)

Establishes connection to the wallet (optional).
Some wallets require explicit connection, others connect implicitly on first use.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`WalletAdapter`](WalletAdapter.md).[`connect`](WalletAdapter.md#connect)

***

### disconnect()?

> `optional` **disconnect**(): `void`

Defined in: [wallet/wallet.interface.ts:119](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L119)

Disconnects the wallet and clears any cached state.
Optional - adapters can override if they need cleanup.

#### Returns

`void`

#### Inherited from

[`WalletAdapter`](WalletAdapter.md).[`disconnect`](WalletAdapter.md#disconnect)

***

### getCapabilities()

> **getCapabilities**(): [`WalletCapabilities`](../interfaces/WalletCapabilities.md)

Defined in: [wallet/mock-wallet.adapter.ts:135](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L135)

Returns the capabilities supported by the mock adapter.
Mock adapter supports all capabilities for testing.

#### Returns

[`WalletCapabilities`](../interfaces/WalletCapabilities.md)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getCapabilities`](WalletAdapter.md#getcapabilities)

***

### getNetwork()

> **getNetwork**(): `Promise`\<`string` \| `undefined`\>

Defined in: [wallet/mock-wallet.adapter.ts:126](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L126)

Returns mock network (always returns configured network or undefined)

#### Returns

`Promise`\<`string` \| `undefined`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getNetwork`](WalletAdapter.md#getnetwork)

***

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [wallet/mock-wallet.adapter.ts:91](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L91)

Returns the configured public key or a default mock key.
Will throw if `failGetPublicKey` option is true.

#### Returns

`Promise`\<`string`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getPublicKey`](WalletAdapter.md#getpublickey)

***

### isAvailable()

> **isAvailable**(): `boolean`

Defined in: [wallet/mock-wallet.adapter.ts:83](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L83)

Mock wallet is always available.

#### Returns

`boolean`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`isAvailable`](WalletAdapter.md#isavailable)

***

### signMessage()

> **signMessage**(`message`): `Promise`\<`string`\>

Defined in: [wallet/mock-wallet.adapter.ts:115](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L115)

Returns a mock signature prefixed with 'mock-signature:'.
Will throw if `failSignMessage` option is true.

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`string`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`signMessage`](WalletAdapter.md#signmessage)

***

### signTransaction()

> **signTransaction**(`xdr`): `Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

Defined in: [wallet/mock-wallet.adapter.ts:103](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L103)

Returns a signed XDR prefixed with 'mock-signed:'.
Will throw if `failSignTransaction` option is true.

#### Parameters

##### xdr

`string`

#### Returns

`Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`signTransaction`](WalletAdapter.md#signtransaction)

## Properties

### name

> `readonly` **name**: [`Mock`](../enumerations/WalletName.md#mock) = `WalletName.Mock`

Defined in: [wallet/mock-wallet.adapter.ts:71](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/mock-wallet.adapter.ts#L71)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`name`](WalletAdapter.md#name)

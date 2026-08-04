[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / FreighterAdapter

# Class: FreighterAdapter

Defined in: [wallet/freighter.adapter.ts:18](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L18)

Freighter wallet adapter.

Uses `@stellar/freighter-api` (or the global `window.freighter`)
to request public keys and sign Soroban transactions.

## See

https://docs.freighter.app/

## Extends

- [`WalletAdapter`](WalletAdapter.md)

## Constructors

### Constructor

> **new FreighterAdapter**(`options?`): `FreighterAdapter`

Defined in: [wallet/freighter.adapter.ts:22](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L22)

#### Parameters

##### options?

[`WalletAdapterOptions`](../interfaces/WalletAdapterOptions.md) = `{}`

#### Returns

`FreighterAdapter`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`constructor`](WalletAdapter.md#constructor)

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [wallet/freighter.adapter.ts:43](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L43)

Connects to Freighter. Attempts auto-reconnect first if already connected.
This is optional - getPublicKey() will also work without explicit connect().

#### Returns

`Promise`\<`void`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`connect`](WalletAdapter.md#connect)

***

### disconnect()

> **disconnect**(): `void`

Defined in: [wallet/freighter.adapter.ts:276](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L276)

Disconnects the wallet and clears cached state

#### Returns

`void`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`disconnect`](WalletAdapter.md#disconnect)

***

### getCapabilities()

> **getCapabilities**(): [`WalletCapabilities`](../interfaces/WalletCapabilities.md)

Defined in: [wallet/freighter.adapter.ts:177](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L177)

Returns the capabilities supported by this wallet adapter.
Allows UI to adapt dynamically based on wallet features.

#### Returns

[`WalletCapabilities`](../interfaces/WalletCapabilities.md)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getCapabilities`](WalletAdapter.md#getcapabilities)

***

### getNetwork()

> **getNetwork**(): `Promise`\<`string` \| `undefined`\>

Defined in: [wallet/freighter.adapter.ts:163](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L163)

Returns the currently selected network from the wallet.
Not all wallets expose this.

#### Returns

`Promise`\<`string` \| `undefined`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getNetwork`](WalletAdapter.md#getnetwork)

***

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [wallet/freighter.adapter.ts:65](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L65)

Retrieves the user's public key from the wallet.
May prompt the user for permission.

#### Returns

`Promise`\<`string`\>

#### Throws

`WalletNotInstalled` | `WalletNotConnected` | `UserRejected` | `Unknown`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getPublicKey`](WalletAdapter.md#getpublickey)

***

### isAvailable()

> **isAvailable**(): `boolean`

Defined in: [wallet/freighter.adapter.ts:31](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L31)

Returns true if the wallet is available in the current environment
(e.g. extension installed, or web-based wallet always available).

#### Returns

`boolean`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`isAvailable`](WalletAdapter.md#isavailable)

***

### signMessage()

> **signMessage**(`message`): `Promise`\<`string`\>

Defined in: [wallet/freighter.adapter.ts:133](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L133)

Signs an arbitrary message (used for SIWS auth flows).
Not all wallets support this — adapter may throw.

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`string`\>

#### Throws

when unsupported (default implementation)

#### Throws

`UserRejected` | `Unknown` when supported but failing

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`signMessage`](WalletAdapter.md#signmessage)

***

### signTransaction()

> **signTransaction**(`xdr`, `opts?`): `Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

Defined in: [wallet/freighter.adapter.ts:98](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L98)

Signs a Soroban transaction XDR and returns the signed envelope.

Prefer `opts.networkPassphrase` when provided; otherwise use
`this.options.networkPassphrase`. Return the full signed envelope
without stripping existing signatures.

#### Parameters

##### xdr

`string`

Base64-encoded transaction envelope XDR

##### opts?

Optional overrides (network passphrase, account to sign for)

###### accountToSign?

`string`

###### networkPassphrase?

`string`

#### Returns

`Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

#### Throws

`WalletNotInstalled` | `WalletNotConnected` | `UserRejected` | `InvalidParams` | `Unknown`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`signTransaction`](WalletAdapter.md#signtransaction)

## Properties

### name

> `readonly` **name**: [`Freighter`](../enumerations/WalletName.md#freighter) = `WalletName.Freighter`

Defined in: [wallet/freighter.adapter.ts:19](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/freighter.adapter.ts#L19)

Stable adapter identifier. Prefer a [WalletName](../enumerations/WalletName.md) value for
built-ins; custom adapters may use any string (or `WalletName.Custom`).

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`name`](WalletAdapter.md#name)

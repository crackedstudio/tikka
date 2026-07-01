[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RabetAdapter

# Class: RabetAdapter

Defined in: [wallet/rabet.adapter.ts:19](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L19)

Rabet wallet adapter.

Rabet is a lightweight browser extension wallet for Stellar.
Uses the global `window.rabet` object to interact with the extension.

## See

 - https://rabet.io
 - https://docs.rabet.io/api

## Extends

- [`WalletAdapter`](WalletAdapter.md)

## Constructors

### Constructor

> **new RabetAdapter**(`options?`): `RabetAdapter`

Defined in: [wallet/rabet.adapter.ts:22](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L22)

#### Parameters

##### options?

[`WalletAdapterOptions`](../interfaces/WalletAdapterOptions.md) = `{}`

#### Returns

`RabetAdapter`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`constructor`](WalletAdapter.md#constructor)

## Methods

### connect()?

> `optional` **connect**(): `Promise`\<`void`\>

Defined in: [wallet/wallet.interface.ts:74](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/wallet.interface.ts#L74)

Establishes connection to the wallet (optional).
Some wallets require explicit connection, others connect implicitly on first use.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`WalletAdapter`](WalletAdapter.md).[`connect`](WalletAdapter.md#connect)

***

### disconnect()?

> `optional` **disconnect**(): `void`

Defined in: [wallet/wallet.interface.ts:119](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/wallet.interface.ts#L119)

Disconnects the wallet and clears any cached state.
Optional - adapters can override if they need cleanup.

#### Returns

`void`

#### Inherited from

[`WalletAdapter`](WalletAdapter.md).[`disconnect`](WalletAdapter.md#disconnect)

***

### getCapabilities()

> **getCapabilities**(): [`WalletCapabilities`](../interfaces/WalletCapabilities.md)

Defined in: [wallet/rabet.adapter.ts:123](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L123)

Returns the capabilities supported by this wallet adapter.
Allows UI to adapt dynamically based on wallet features.

#### Returns

[`WalletCapabilities`](../interfaces/WalletCapabilities.md)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getCapabilities`](WalletAdapter.md#getcapabilities)

***

### getNetwork()

> **getNetwork**(): `Promise`\<`string` \| `undefined`\>

Defined in: [wallet/rabet.adapter.ts:113](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L113)

Returns the currently selected network from the wallet.
Not all wallets expose this.

#### Returns

`Promise`\<`string` \| `undefined`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getNetwork`](WalletAdapter.md#getnetwork)

***

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [wallet/rabet.adapter.ts:38](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L38)

Retrieves the user's public key from the wallet.
May prompt the user for permission.

#### Returns

`Promise`\<`string`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getPublicKey`](WalletAdapter.md#getpublickey)

***

### isAvailable()

> **isAvailable**(): `boolean`

Defined in: [wallet/rabet.adapter.ts:30](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L30)

Returns true if the wallet is available in the current environment
(e.g. extension installed, or web-based wallet always available).

#### Returns

`boolean`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`isAvailable`](WalletAdapter.md#isavailable)

***

### signMessage()

> **signMessage**(`_message`): `Promise`\<`string`\>

Defined in: [wallet/wallet.interface.ts:97](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/wallet.interface.ts#L97)

Signs an arbitrary message (used for SIWS auth flows).
Not all wallets support this — adapter may throw.

#### Parameters

##### \_message

`string`

#### Returns

`Promise`\<`string`\>

#### Inherited from

[`WalletAdapter`](WalletAdapter.md).[`signMessage`](WalletAdapter.md#signmessage)

***

### signTransaction()

> **signTransaction**(`xdr`, `opts?`): `Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

Defined in: [wallet/rabet.adapter.ts:69](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L69)

Signs a Soroban transaction XDR and returns the signed envelope.

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

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`signTransaction`](WalletAdapter.md#signtransaction)

## Properties

### name

> `readonly` **name**: [`Rabet`](../enumerations/WalletName.md#rabet) = `WalletName.Rabet`

Defined in: [wallet/rabet.adapter.ts:20](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/rabet.adapter.ts#L20)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`name`](WalletAdapter.md#name)

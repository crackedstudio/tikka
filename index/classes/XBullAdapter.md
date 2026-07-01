[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / XBullAdapter

# Class: XBullAdapter

Defined in: [wallet/xbull.adapter.ts:17](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L17)

Common interface every wallet adapter must implement.

## Extends

- [`WalletAdapter`](WalletAdapter.md)

## Constructors

### Constructor

> **new XBullAdapter**(`options?`): `XBullAdapter`

Defined in: [wallet/xbull.adapter.ts:29](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L29)

#### Parameters

##### options?

[`WalletAdapterOptions`](../interfaces/WalletAdapterOptions.md) = `{}`

#### Returns

`XBullAdapter`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`constructor`](WalletAdapter.md#constructor)

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [wallet/xbull.adapter.ts:41](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L41)

Establishes connection to the wallet (optional).
Some wallets require explicit connection, others connect implicitly on first use.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`connect`](WalletAdapter.md#connect)

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [wallet/xbull.adapter.ts:71](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L71)

Disconnects the wallet and clears any cached state.
Optional - adapters can override if they need cleanup.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`disconnect`](WalletAdapter.md#disconnect)

***

### getCapabilities()

> **getCapabilities**(): [`WalletCapabilities`](../interfaces/WalletCapabilities.md)

Defined in: [wallet/xbull.adapter.ts:125](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L125)

Returns the capabilities supported by this wallet adapter.
Allows UI to adapt dynamically based on wallet features.

#### Returns

[`WalletCapabilities`](../interfaces/WalletCapabilities.md)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getCapabilities`](WalletAdapter.md#getcapabilities)

***

### getNetwork()

> **getNetwork**(): `Promise`\<`string` \| `undefined`\>

Defined in: [wallet/wallet.interface.ts:105](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/wallet.interface.ts#L105)

Returns the currently selected network from the wallet.
Not all wallets expose this.

#### Returns

`Promise`\<`string` \| `undefined`\>

#### Inherited from

[`WalletAdapter`](WalletAdapter.md).[`getNetwork`](WalletAdapter.md#getnetwork)

***

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [wallet/xbull.adapter.ts:81](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L81)

Retrieves the user's public key from the wallet.
May prompt the user for permission.

#### Returns

`Promise`\<`string`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getPublicKey`](WalletAdapter.md#getpublickey)

***

### isAvailable()

> **isAvailable**(): `boolean`

Defined in: [wallet/xbull.adapter.ts:33](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L33)

Returns true if the wallet is available in the current environment
(e.g. extension installed, or web-based wallet always available).

#### Returns

`boolean`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`isAvailable`](WalletAdapter.md#isavailable)

***

### isWalletConnected()

> **isWalletConnected**(): `boolean`

Defined in: [wallet/xbull.adapter.ts:77](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L77)

Whether the adapter currently considers itself connected (cached flag).

#### Returns

`boolean`

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

Defined in: [wallet/xbull.adapter.ts:99](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L99)

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

> `readonly` **name**: [`XBull`](../enumerations/WalletName.md#xbull) = `WalletName.XBull`

Defined in: [wallet/xbull.adapter.ts:18](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/wallet/xbull.adapter.ts#L18)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`name`](WalletAdapter.md#name)

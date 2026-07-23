[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / AlbedoAdapter

# Class: AlbedoAdapter

Defined in: [wallet/albedo.adapter.ts:18](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L18)

Albedo wallet adapter.

Albedo is a web-based wallet (popup) — no browser extension needed.
It dynamically loads the Albedo intent library.

## See

https://albedo.link

## Extends

- [`WalletAdapter`](WalletAdapter.md)

## Constructors

### Constructor

> **new AlbedoAdapter**(`options?`): `AlbedoAdapter`

Defined in: [wallet/albedo.adapter.ts:21](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L21)

#### Parameters

##### options?

[`WalletAdapterOptions`](../interfaces/WalletAdapterOptions.md) = `{}`

#### Returns

`AlbedoAdapter`

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

Defined in: [wallet/albedo.adapter.ts:123](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L123)

Returns the capabilities supported by this wallet adapter.
Allows UI to adapt dynamically based on wallet features.

#### Returns

[`WalletCapabilities`](../interfaces/WalletCapabilities.md)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getCapabilities`](WalletAdapter.md#getcapabilities)

***

### getNetwork()

> **getNetwork**(): `Promise`\<`string` \| `undefined`\>

Defined in: [wallet/albedo.adapter.ts:115](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L115)

Returns the network passphrase configured for this adapter.
Albedo doesn't expose the user's selected network, so we return
the configured network from adapter options.

#### Returns

`Promise`\<`string` \| `undefined`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getNetwork`](WalletAdapter.md#getnetwork)

***

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [wallet/albedo.adapter.ts:30](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L30)

Retrieves the user's public key from the wallet.
May prompt the user for permission.

#### Returns

`Promise`\<`string`\>

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`getPublicKey`](WalletAdapter.md#getpublickey)

***

### isAvailable()

> **isAvailable**(): `boolean`

Defined in: [wallet/albedo.adapter.ts:26](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L26)

Albedo is web-based — always available in a browser environment.

#### Returns

`boolean`

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`isAvailable`](WalletAdapter.md#isavailable)

***

### signMessage()

> **signMessage**(`message`): `Promise`\<`string`\>

Defined in: [wallet/albedo.adapter.ts:93](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L93)

Signs an arbitrary message using Albedo's sign_message intent.
Useful for authentication flows (e.g., SIWS - Sign In With Stellar).

#### Parameters

##### message

`string`

Text message to sign

#### Returns

`Promise`\<`string`\>

HEX-encoded signature

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`signMessage`](WalletAdapter.md#signmessage)

***

### signTransaction()

> **signTransaction**(`xdr`, `opts?`): `Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

Defined in: [wallet/albedo.adapter.ts:47](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L47)

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

> `readonly` **name**: [`Albedo`](../enumerations/WalletName.md#albedo) = `WalletName.Albedo`

Defined in: [wallet/albedo.adapter.ts:19](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/albedo.adapter.ts#L19)

#### Overrides

[`WalletAdapter`](WalletAdapter.md).[`name`](WalletAdapter.md#name)

[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / WalletAdapter

# Abstract Class: WalletAdapter

Defined in: [wallet/wallet.interface.ts:59](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L59)

Common interface every wallet adapter must implement.

## Extended by

- [`FreighterAdapter`](FreighterAdapter.md)
- [`XBullAdapter`](XBullAdapter.md)
- [`AlbedoAdapter`](AlbedoAdapter.md)
- [`LobstrAdapter`](LobstrAdapter.md)
- [`RabetAdapter`](RabetAdapter.md)
- [`MockWalletAdapter`](MockWalletAdapter.md)

## Constructors

### Constructor

> **new WalletAdapter**(`options?`): `WalletAdapter`

Defined in: [wallet/wallet.interface.ts:62](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L62)

#### Parameters

##### options?

[`WalletAdapterOptions`](../interfaces/WalletAdapterOptions.md) = `{}`

#### Returns

`WalletAdapter`

## Methods

### connect()?

> `optional` **connect**(): `Promise`\<`void`\>

Defined in: [wallet/wallet.interface.ts:74](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L74)

Establishes connection to the wallet (optional).
Some wallets require explicit connection, others connect implicitly on first use.

#### Returns

`Promise`\<`void`\>

***

### disconnect()?

> `optional` **disconnect**(): `void`

Defined in: [wallet/wallet.interface.ts:119](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L119)

Disconnects the wallet and clears any cached state.
Optional - adapters can override if they need cleanup.

#### Returns

`void`

***

### getCapabilities()

> `abstract` **getCapabilities**(): [`WalletCapabilities`](../interfaces/WalletCapabilities.md)

Defined in: [wallet/wallet.interface.ts:113](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L113)

Returns the capabilities supported by this wallet adapter.
Allows UI to adapt dynamically based on wallet features.

#### Returns

[`WalletCapabilities`](../interfaces/WalletCapabilities.md)

***

### getNetwork()

> **getNetwork**(): `Promise`\<`string` \| `undefined`\>

Defined in: [wallet/wallet.interface.ts:105](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L105)

Returns the currently selected network from the wallet.
Not all wallets expose this.

#### Returns

`Promise`\<`string` \| `undefined`\>

***

### getPublicKey()

> `abstract` **getPublicKey**(): `Promise`\<`string`\>

Defined in: [wallet/wallet.interface.ts:80](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L80)

Retrieves the user's public key from the wallet.
May prompt the user for permission.

#### Returns

`Promise`\<`string`\>

***

### isAvailable()

> `abstract` **isAvailable**(): `boolean`

Defined in: [wallet/wallet.interface.ts:68](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L68)

Returns true if the wallet is available in the current environment
(e.g. extension installed, or web-based wallet always available).

#### Returns

`boolean`

***

### signMessage()

> **signMessage**(`_message`): `Promise`\<`string`\>

Defined in: [wallet/wallet.interface.ts:97](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L97)

Signs an arbitrary message (used for SIWS auth flows).
Not all wallets support this — adapter may throw.

#### Parameters

##### \_message

`string`

#### Returns

`Promise`\<`string`\>

***

### signTransaction()

> `abstract` **signTransaction**(`xdr`, `opts?`): `Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

Defined in: [wallet/wallet.interface.ts:88](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L88)

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

## Properties

### name

> `abstract` `readonly` **name**: [`WalletName`](../enumerations/WalletName.md)

Defined in: [wallet/wallet.interface.ts:60](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/wallet/wallet.interface.ts#L60)

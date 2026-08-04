[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / WalletAdapter

# Abstract Class: WalletAdapter

Defined in: [wallet/wallet.interface.ts:92](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L92)

Common interface every wallet adapter must implement.

### Required methods
- [isAvailable](#isavailable) — environment / extension detection
- [getPublicKey](#getpublickey) — return the active `G…` account
- [signTransaction](#signtransaction) — sign a base64 transaction envelope XDR
- [getCapabilities](#getcapabilities) — advertise supported features

### Optional methods
- [connect](#connect) / [disconnect](#disconnect) — explicit session lifecycle
- [signMessage](#signmessage) — SIWS / arbitrary message signing (default throws)
- [getNetwork](#getnetwork) — selected network passphrase (default `undefined`)

### Expected errors
Throw [TikkaSdkError](TikkaSdkError.md) with:
- `WalletNotInstalled` — bridge / extension missing
- `WalletNotConnected` — present but not authorized
- `UserRejected` — user cancelled a prompt
- `InvalidParams` — bad XDR / network / account
- `Unknown` — unexpected failure (attach `cause`)

### Signing flow
SDK builds unsigned XDR → `signTransaction(xdr, opts?)` →
adapter returns `{ signedXdr }` → SDK submits to Soroban RPC.

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

Defined in: [wallet/wallet.interface.ts:99](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L99)

#### Parameters

##### options?

[`WalletAdapterOptions`](../interfaces/WalletAdapterOptions.md) = `{}`

#### Returns

`WalletAdapter`

## Methods

### connect()?

> `optional` **connect**(): `Promise`\<`void`\>

Defined in: [wallet/wallet.interface.ts:111](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L111)

Establishes connection to the wallet (optional).
Some wallets require explicit connection, others connect implicitly on first use.

#### Returns

`Promise`\<`void`\>

***

### disconnect()?

> `optional` **disconnect**(): `void`

Defined in: [wallet/wallet.interface.ts:166](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L166)

Disconnects the wallet and clears any cached state.
Optional - adapters can override if they need cleanup.

#### Returns

`void`

***

### getCapabilities()

> `abstract` **getCapabilities**(): [`WalletCapabilities`](../interfaces/WalletCapabilities.md)

Defined in: [wallet/wallet.interface.ts:160](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L160)

Returns the capabilities supported by this wallet adapter.
Allows UI to adapt dynamically based on wallet features.

#### Returns

[`WalletCapabilities`](../interfaces/WalletCapabilities.md)

***

### getNetwork()

> **getNetwork**(): `Promise`\<`string` \| `undefined`\>

Defined in: [wallet/wallet.interface.ts:152](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L152)

Returns the currently selected network from the wallet.
Not all wallets expose this.

#### Returns

`Promise`\<`string` \| `undefined`\>

***

### getPublicKey()

> `abstract` **getPublicKey**(): `Promise`\<`string`\>

Defined in: [wallet/wallet.interface.ts:119](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L119)

Retrieves the user's public key from the wallet.
May prompt the user for permission.

#### Returns

`Promise`\<`string`\>

#### Throws

`WalletNotInstalled` | `WalletNotConnected` | `UserRejected` | `Unknown`

***

### isAvailable()

> `abstract` **isAvailable**(): `boolean`

Defined in: [wallet/wallet.interface.ts:105](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L105)

Returns true if the wallet is available in the current environment
(e.g. extension installed, or web-based wallet always available).

#### Returns

`boolean`

***

### signMessage()

> **signMessage**(`_message`): `Promise`\<`string`\>

Defined in: [wallet/wallet.interface.ts:144](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L144)

Signs an arbitrary message (used for SIWS auth flows).
Not all wallets support this — adapter may throw.

#### Parameters

##### \_message

`string`

#### Returns

`Promise`\<`string`\>

#### Throws

when unsupported (default implementation)

#### Throws

`UserRejected` | `Unknown` when supported but failing

***

### signTransaction()

> `abstract` **signTransaction**(`xdr`, `opts?`): `Promise`\<[`SignTransactionResult`](../interfaces/SignTransactionResult.md)\>

Defined in: [wallet/wallet.interface.ts:132](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L132)

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

## Properties

### name

> `abstract` `readonly` **name**: `string`

Defined in: [wallet/wallet.interface.ts:97](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L97)

Stable adapter identifier. Prefer a [WalletName](../enumerations/WalletName.md) value for
built-ins; custom adapters may use any string (or `WalletName.Custom`).

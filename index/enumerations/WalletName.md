[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / WalletName

# Enumeration: WalletName

Defined in: [wallet/wallet.interface.ts:12](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L12)

WalletAdapter — abstract interface for Stellar wallet integrations.

Implementations: FreighterAdapter, XBullAdapter, AlbedoAdapter,
LobstrAdapter, RabetAdapter, MockWalletAdapter, plus any custom adapter
that extends this class.

## See

WALLET_ADAPTER.md for the full integrator contract
     (methods, expected errors, and signing flow).

## Enumeration Members

### Albedo

> **Albedo**: `"albedo"`

Defined in: [wallet/wallet.interface.ts:15](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L15)

***

### Custom

> **Custom**: `"custom"`

Defined in: [wallet/wallet.interface.ts:20](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L20)

Reserved identifier for third-party / in-house adapters

***

### Freighter

> **Freighter**: `"freighter"`

Defined in: [wallet/wallet.interface.ts:13](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L13)

***

### LOBSTR

> **LOBSTR**: `"lobstr"`

Defined in: [wallet/wallet.interface.ts:16](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L16)

***

### Mock

> **Mock**: `"mock"`

Defined in: [wallet/wallet.interface.ts:18](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L18)

***

### Rabet

> **Rabet**: `"rabet"`

Defined in: [wallet/wallet.interface.ts:17](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L17)

***

### XBull

> **XBull**: `"xbull"`

Defined in: [wallet/wallet.interface.ts:14](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/wallet/wallet.interface.ts#L14)

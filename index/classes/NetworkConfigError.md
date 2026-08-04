[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / NetworkConfigError

# Class: NetworkConfigError

Defined in: [network/network-config.error.ts:9](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network-config.error.ts#L9)

Typed configuration error for network setup (issue #1096).

Distinct from a generic `Error` so callers can branch on it — a malformed
config is a programming mistake to be fixed at the call site, not a
transient network failure to be retried. Throwing plain `Error` forces
callers to string-match the message to tell the two apart.

## Extends

- `Error`

## Constructors

### Constructor

> **new NetworkConfigError**(`field`, `value`, `reason`): `NetworkConfigError`

Defined in: [network/network-config.error.ts:16](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network-config.error.ts#L16)

#### Parameters

##### field

`string`

##### value

`unknown`

##### reason

`string`

#### Returns

`NetworkConfigError`

#### Overrides

`Error.constructor`

## Properties

### field

> `readonly` **field**: `string`

Defined in: [network/network-config.error.ts:11](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network-config.error.ts#L11)

The config field that failed validation, e.g. `rpcUrl`.

***

### value

> `readonly` **value**: `unknown`

Defined in: [network/network-config.error.ts:14](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network-config.error.ts#L14)

The value that was rejected, for the message and for logging.

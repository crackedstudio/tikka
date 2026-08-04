[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / multiplyAmountByQuantity

# Function: multiplyAmountByQuantity()

> **multiplyAmountByQuantity**(`amount`, `quantity`, `decimals?`): `string`

Defined in: [utils/formatting.ts:91](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/formatting.ts#L91)

Multiplies an XLM/token amount by an integer quantity safely.

## Parameters

### amount

`string` \| `number`

Amount string (or safe integer). Decimal strings are required for fractional values.

### quantity

`number`

Positive safe integer multiplier.

### decimals?

`number` = `7`

Number of decimal places in the result (default: 7 for XLM).
                 Pass a higher value (e.g. 18) for tokens with higher precision.

## Returns

`string`

## Example

```ts
multiplyAmountByQuantity('1.5', 3)          // '4.5000000'  (XLM, 7 dp)
multiplyAmountByQuantity('1.5', 3, 18)       // '4.500000000000000000' (18 dp token)
```

[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / FeeQuote

# Interface: FeeQuote

Defined in: [fee-estimator/fee-estimator.types.ts:42](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L42)

A reusable, typed fee quote returned by `FeeEstimatorService.getFeeQuote()`.

Carries everything a signing flow needs:
- The estimated amounts (`xlm`, `stroops`)
- Where the estimate came from (`source`)
- How reliable it is (`confidence`)
- When it expires (`expiresAt`) — re-fetch if `Date.now() > expiresAt`
- Any caveats the UI should surface (`warnings`)
- The full resource breakdown for power-user UIs (`resources`)

## Properties

### confidence

> **confidence**: [`FeeQuoteConfidence`](../type-aliases/FeeQuoteConfidence.md)

Defined in: [fee-estimator/fee-estimator.types.ts:52](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L52)

Reliability of this estimate

***

### expiresAt

> **expiresAt**: `number`

Defined in: [fee-estimator/fee-estimator.types.ts:48](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L48)

Timestamp (ms since epoch) when this quote should be considered stale

***

### resources

> **resources**: [`FeeResourceBreakdown`](FeeResourceBreakdown.md)

Defined in: [fee-estimator/fee-estimator.types.ts:56](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L56)

Detailed per-component resource breakdown

***

### source

> **source**: [`FeeQuoteSource`](../type-aliases/FeeQuoteSource.md)

Defined in: [fee-estimator/fee-estimator.types.ts:50](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L50)

How the estimate was derived

***

### stroops

> **stroops**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:46](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L46)

Estimated total fee in stroops (string to avoid overflow)

***

### warnings

> **warnings**: [`FeeQuoteWarning`](FeeQuoteWarning.md)[]

Defined in: [fee-estimator/fee-estimator.types.ts:54](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L54)

Warnings the UI should surface (empty when confidence is high)

***

### xlm

> **xlm**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:44](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L44)

Estimated total fee in human-readable XLM (7 decimal places)

[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / FeeQuoteSource

# Type Alias: FeeQuoteSource

> **FeeQuoteSource** = `"simulation"` \| `"fallback"`

Defined in: [fee-estimator/fee-estimator.types.ts:10](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.types.ts#L10)

How the fee estimate was derived.
- `simulation` — live `simulateTransaction` RPC call (most accurate)
- `fallback`   — static heuristic used when simulation is unavailable

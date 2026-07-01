[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / FeeEstimatorModule

# Class: FeeEstimatorModule

Defined in: [fee-estimator/fee-estimator.module.ts:27](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/fee-estimator/fee-estimator.module.ts#L27)

FeeEstimatorModule

Import this module wherever you need pre-signature fee estimation.
Requires `NetworkModule.forRoot(...)` to be imported upstream.

## Example

```ts
@Module({
  imports: [
    NetworkModule.forRoot('testnet'),
    FeeEstimatorModule,
  ],
})
export class AppModule {}
```

## Constructors

### Constructor

> **new FeeEstimatorModule**(): `FeeEstimatorModule`

#### Returns

`FeeEstimatorModule`

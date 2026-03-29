import { Module } from '@nestjs/common';
import { NetworkModule } from '../network/network.module';
import { FeeEstimatorService } from './fee-estimator.service';

/**
 * FeeEstimatorModule
 *
 * Import this module wherever you need pre-signature fee estimation.
 * Requires `NetworkModule.forRoot(...)` to be imported upstream.
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [
 *     NetworkModule.forRoot('testnet'),
 *     FeeEstimatorModule,
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [NetworkModule],
  providers: [FeeEstimatorService],
  exports: [FeeEstimatorService],
})
export class FeeEstimatorModule {}

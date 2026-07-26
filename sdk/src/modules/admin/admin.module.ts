import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * NestJS module that provides admin operations for the Tikka raffle contract.
 *
 * @category Admin
 * @remarks
 * Exports {@link AdminService} for dependency injection.
 * Provides methods for pausing/unpausing the contract, managing admin rights,
 * and performing administrative raffle operations.
 *
 * @example
 * ```ts
 * import { AdminModule } from '@tikka/sdk';
 *
 * @Module({
 *   imports: [AdminModule],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

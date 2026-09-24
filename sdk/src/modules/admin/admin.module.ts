import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * NestJS module that registers and exports {@link AdminService}.
 * @category Admin
 */
@Module({
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

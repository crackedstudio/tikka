import { Global, Module } from '@nestjs/common';
import { MaintenanceModeService } from './maintenance-mode.service';

@Global()
@Module({
  providers: [MaintenanceModeService],
  exports: [MaintenanceModeService],
})
export class MaintenanceModeModule {}

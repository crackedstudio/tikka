import { Module, Global } from '@nestjs/common';
import { OracleRegistryService } from './oracle-registry.service';
import { MultiOracleCoordinatorService } from './multi-oracle-coordinator.service';

@Global()
@Module({
  providers: [
    OracleRegistryService,
    MultiOracleCoordinatorService,
  ],
  exports: [
    OracleRegistryService,
    MultiOracleCoordinatorService,
  ],
})
export class MultiOracleModule {}

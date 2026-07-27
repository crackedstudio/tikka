import { Module, Global } from '@nestjs/common';
import { OracleRegistryService } from './oracle-registry.service';
import { MultiOracleCoordinatorService } from './multi-oracle-coordinator.service';
import { AuditLogModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';

@Global()
@Module({
  imports: [AuditLogModule, MetricsModule],
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

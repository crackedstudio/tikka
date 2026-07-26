import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ArchiveIntegrityStatusService } from './archive-integrity-status.service';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
import { IngestorModule } from '../ingestor/ingestor.module';

@Module({
  imports: [DatabaseModule, CacheModule, IngestorModule],
  controllers: [HealthController],
  providers: [HealthService, ArchiveIntegrityStatusService],
  exports: [HealthService, ArchiveIntegrityStatusService],
})
export class HealthModule {}

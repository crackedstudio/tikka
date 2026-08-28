import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RafflesController } from './raffles.controller';
import { OgRenderController } from './og-render.controller';
import { AdminRafflesController } from './admin-raffles.controller';
import { RafflesService } from './raffles.service';
import { MetadataModule } from '../../../services/metadata/metadata.module';
import { MetadataService } from '../../../services/metadata/metadata.service';
import { IndexerModule } from '../../../services/indexer/indexer.module';
import { SupabaseModule } from '../../../services/storage/supabase.module';
import { StorageService } from '../../../services/storage/storage.service';
import { ImageOptimizerService } from '../../../services/metadata/image-optimizer.service';
import { MetricsService } from '../../../services/metrics/metrics.service';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { AdminGuard } from '../monitor/admin.guard';
import { MonitorService } from '../monitor/monitor.service';
import { SseService } from '../../../services/notifications/sse.service';

@Module({
  imports: [IndexerModule, MetadataModule, SupabaseModule, ConfigModule],
  controllers: [RafflesController, OgRenderController, AdminRafflesController],
providers: [
    RafflesService,
    StorageService,
    ImageOptimizerService,
    MetricsService,
    IdempotencyService,
    IdempotencyInterceptor,
    AdminGuard,
    MonitorService,
    SseService,
  ],
  exports: [RafflesService],
})
export class RafflesModule {}

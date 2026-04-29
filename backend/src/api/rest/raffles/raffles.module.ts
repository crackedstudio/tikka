import { Module } from '@nestjs/common';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { MetadataService } from '../../../services/metadata.service';
import { IndexerModule } from '../../../services/indexer.module';
import { StorageService } from '../../../services/storage.service';
import { ImageOptimizerService } from '../../../services/image-optimizer.service';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';

@Module({
  imports: [IndexerModule],
  controllers: [RafflesController],
  providers: [
    RafflesService,
    MetadataService,
    StorageService,
    ImageOptimizerService,
    IdempotencyService,
    IdempotencyInterceptor,
  ],
  exports: [RafflesService],
})
export class RafflesModule {}


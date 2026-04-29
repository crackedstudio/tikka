import { Module } from '@nestjs/common';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { MetadataModule } from '../../../services/metadata.module';
import { IndexerModule } from '../../../services/indexer.module';
import { StorageService } from '../../../services/storage.service';
import { ImageOptimizerService } from '../../../services/image-optimizer.service';

@Module({
  imports: [IndexerModule, MetadataModule],
  controllers: [RafflesController],
  providers: [RafflesService, StorageService, ImageOptimizerService],
  exports: [RafflesService],
})
export class RafflesModule {}


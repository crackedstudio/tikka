import { Module } from '@nestjs/common';
import { RafflesController } from './raffles.controller';
import { OgRenderController } from './og-render.controller';
import { RafflesService } from './raffles.service';
import { MetadataModule } from '../../../services/metadata.module';
import { IndexerModule } from '../../../services/indexer.module';
import { StorageService } from '../../../services/storage.service';
import { ImageOptimizerService } from '../../../services/image-optimizer.service';
import { PinningService } from '../../../services/pinning.service';

@Module({
  imports: [IndexerModule],
  controllers: [RafflesController, OgRenderController],
  providers: [RafflesService, MetadataService, StorageService, ImageOptimizerService],
  exports: [RafflesService],
})
export class RafflesModule {}



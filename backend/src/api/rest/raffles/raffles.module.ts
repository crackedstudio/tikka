import { Module } from '@nestjs/common';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { MetadataService } from '../../../services/metadata.service';
import { IndexerModule } from '../../../services/indexer.module';
import { StorageService } from '../../../services/storage.service';

@Module({
  imports: [IndexerModule],
  controllers: [RafflesController],
  providers: [RafflesService, MetadataService, StorageService],
  exports: [RafflesService],
})
export class RafflesModule {}


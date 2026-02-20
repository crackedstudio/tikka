import { Module } from '@nestjs/common';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { MetadataService } from '../../../services/metadata.service';
import { IndexerService } from '../../../services/indexer.service';

@Module({
  controllers: [RafflesController],
  providers: [RafflesService, MetadataService, IndexerService],
  exports: [RafflesService],
})
export class RafflesModule {}

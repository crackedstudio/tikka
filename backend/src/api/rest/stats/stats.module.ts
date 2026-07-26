import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { IndexerModule } from '../../../services/indexer.module';
import { MetadataModule } from '../../../services/metadata.module';

@Module({
  imports: [IndexerModule, MetadataModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}

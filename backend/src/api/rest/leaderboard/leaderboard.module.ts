import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { IndexerEventsController } from './indexer-events.controller';
import { IndexerModule } from '../../../services/indexer.module';
import { MetadataModule } from '../../../services/metadata.module';

@Module({
  imports: [IndexerModule, MetadataModule, ConfigModule],
  controllers: [LeaderboardController, IndexerEventsController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}

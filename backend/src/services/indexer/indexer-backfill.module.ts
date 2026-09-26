import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IndexerModule } from './indexer.module';
import { IndexerBackfillService } from './indexer-backfill.service';
import { HorizonClientService } from './horizon-client.service';
import { BackfillLock } from './backfill-lock';

@Module({
  imports: [IndexerModule, ConfigModule],
  providers: [
    IndexerBackfillService,
    HorizonClientService,
    {
      provide: BackfillLock,
      useValue: new BackfillLock(),
    },
  ],
  exports: [IndexerBackfillService, BackfillLock],
})
export class IndexerBackfillModule {}

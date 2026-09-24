import { Global, Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';

@Global()
@Module({
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}

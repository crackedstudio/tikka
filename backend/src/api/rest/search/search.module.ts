import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from '../../../services/search.service';
import { MetadataService } from '../../../services/metadata.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, MetadataService],
})
export class SearchModule {}

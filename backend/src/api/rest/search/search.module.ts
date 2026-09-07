import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from '../../../services/search/search.service';
import { MetadataModule } from '../../../services/metadata/metadata.module';

@Module({
  imports: [MetadataModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}

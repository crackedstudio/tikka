import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { SearchService } from '../../../services/search.service';
import { Public } from '../../../auth/decorators/public.decorator';
import { SearchQueryDto, SearchQuerySchema } from './dto/search-query.dto';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Public()
  @UsePipes(new (createZodPipe(SearchQuerySchema))())
  async search(@Query() query: SearchQueryDto) {
    if (!query.q || query.q.trim().length < 2) {
      return { raffles: [], total: 0 };
    }

    return this.searchService.search({
      query: query.q,
      limit: query.limit,
      offset: query.offset,
      category: query.category,
      status: query.status,
    });
  }
}

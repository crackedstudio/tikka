import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from '../../../services/search.service';
import { Public } from '../../../auth/decorators/public.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Public()
  async search(@Query('q') query: string) {
    if (!query || query.trim().length < 2) {
      return { raffles: [], total: 0 };
    }

    const results = await this.searchService.search(query);
    return {
      raffles: results,
      total: results.length,
    };
  }
}

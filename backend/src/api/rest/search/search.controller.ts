import { Controller, Get, Query, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { SearchService } from '../../../services/search.service';

@Controller('search')
@UseInterceptors(ClassSerializerInterceptor)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async findAll(@Query('q') query: string) {
    if (!query || query.trim().length < 2) {
      return { raffles: [], total: 0 };
    }

    const results = await this.searchService.search(query);
    return {
      raffles: results,
      total: results.length
    };
  }
}
import { SearchController } from './search.controller';
import { SearchService } from '../../../services/search.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: { search: jest.Mock };

  beforeEach(() => {
    searchService = {
      search: jest.fn(),
    };

    controller = new SearchController(searchService as unknown as SearchService);
  });

  it('passes a trimmed category filter to the search service', async () => {
    searchService.search.mockResolvedValue([]);

    await controller.search('raffle', '  Art  ');

    expect(searchService.search).toHaveBeenCalledWith('raffle', 'Art');
  });

  it('treats an empty category as no filter', async () => {
    searchService.search.mockResolvedValue([]);

    await controller.search('raffle', '   ');

    expect(searchService.search).toHaveBeenCalledWith('raffle', undefined);
  });
});

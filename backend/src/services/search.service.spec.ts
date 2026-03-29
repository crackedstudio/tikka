import { SearchService } from './search.service';
import { MetadataService } from './metadata.service';
import { IndexerService } from './indexer.service';

describe('SearchService', () => {
  let service: SearchService;
  let metadataService: { searchMetadata: jest.Mock };
  let indexerService: { getRaffle: jest.Mock };

  beforeEach(() => {
    metadataService = {
      searchMetadata: jest.fn(),
    };
    indexerService = {
      getRaffle: jest.fn(),
    };

    service = new SearchService(
      metadataService as unknown as MetadataService,
      indexerService as unknown as IndexerService,
    );
  });

  it('forwards an optional category filter to metadata search', async () => {
    metadataService.searchMetadata.mockResolvedValue([]);

    await service.search('raffle', 'Art');

    expect(metadataService.searchMetadata).toHaveBeenCalledWith('raffle', 'Art');
  });

  it('omits the category filter when none is provided', async () => {
    metadataService.searchMetadata.mockResolvedValue([]);

    await service.search('raffle');

    expect(metadataService.searchMetadata).toHaveBeenCalledWith('raffle', undefined);
  });
});

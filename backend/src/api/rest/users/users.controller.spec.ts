import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserHistoryQueryDto } from './dto/user-history-query.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<Pick<UsersService, 'getByAddress' | 'getHistory' | 'getHistoryAsCsvStream'>>;

  beforeEach(() => {
    service = {
      getByAddress: jest.fn(),
      getHistory: jest.fn(),
      getHistoryAsCsvStream: jest.fn(),
    };
    controller = new UsersController(service as unknown as UsersService);
  });

  describe('getHistory', () => {
    it('delegates to UsersService with pagination query parameters', async () => {
      const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890';
      const dto: UserHistoryQueryDto = { limit: 20, offset: 0 };
      const expectedResult = { items: [], total: 0, limit: 20, offset: 0 };
      service.getHistory.mockResolvedValue(expectedResult as any);

      const result = await controller.getHistory(address, dto);

      expect(service.getHistory).toHaveBeenCalledWith(address, dto);
      expect(result).toBe(expectedResult);
    });

    it('inherits shared pagination DTO defaults', () => {
      const dto = new UserHistoryQueryDto();
      expect(dto.limit).toBe(20);
      expect(dto.offset).toBe(0);
    });
  });
});

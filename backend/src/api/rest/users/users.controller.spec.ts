import { UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserHistoryQueryDto } from './dto/user-history-query.dto';

/** A real, checksum-valid Stellar account address. */
const ADDRESS = 'GBZQEQYUHJSN5JCUOUS4MO2NY4HDNZAGDCOMF7Z2ZQZD3CSHJZAZ4WW3';

/** A second account, used wherever the test must not accidentally match. */
const OTHER_ADDRESS = 'GAON5T23YXAIIF54XGPZFORV7PVASERLXXFWG7JN745BZBLMIU3FICUJ';

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

  /**
   * The export endpoint is the one place where an address arriving from the URL
   * is compared against an address from the JWT. Comparing the raw strings made
   * that comparison depend on spelling.
   */
  describe('exportHistory', () => {
    function reply() {
      const chain = {
        header: jest.fn(),
        send: jest.fn(),
      };
      chain.header.mockReturnValue(chain);
      chain.send.mockReturnValue(chain);
      return chain;
    }

    it('streams the caller own history', async () => {
      const stream = { pipe: jest.fn() };
      service.getHistoryAsCsvStream.mockResolvedValue(stream as any);
      const res = reply();

      await controller.exportHistory(ADDRESS, ADDRESS, res as any);

      expect(service.getHistoryAsCsvStream).toHaveBeenCalledWith(ADDRESS);
      expect(res.send).toHaveBeenCalledWith(stream);
    });

    it.each([
      ['lower case', ADDRESS.toLowerCase()],
      ['surrounding whitespace', ` ${ADDRESS} `],
    ])('accepts the caller own address spelled in %s', async (_label, requested) => {
      service.getHistoryAsCsvStream.mockResolvedValue({} as any);

      await controller.exportHistory(requested, ADDRESS, reply() as any);

      expect(service.getHistoryAsCsvStream).toHaveBeenCalledWith(ADDRESS);
    });

    it('rejects exporting another account history', async () => {
      await expect(
        controller.exportHistory(OTHER_ADDRESS, ADDRESS, reply() as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(service.getHistoryAsCsvStream).not.toHaveBeenCalled();
    });

    it('rejects a malformed requested address', async () => {
      await expect(
        controller.exportHistory('not-an-address', ADDRESS, reply() as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(service.getHistoryAsCsvStream).not.toHaveBeenCalled();
    });

    it('rejects when the token carries no address', async () => {
      await expect(
        controller.exportHistory(ADDRESS, undefined as unknown as string, reply() as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(service.getHistoryAsCsvStream).not.toHaveBeenCalled();
    });
  });
});

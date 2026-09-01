import { TicketReadService } from './ticket.read.service';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { GetUserTicketsParams } from './ticket.types';
import { TikkaSdkError } from '../../utils/errors';

describe('TicketReadService', () => {
  let service: TicketReadService;
  let contractService: jest.Mocked<ContractService>;

  beforeEach(() => {
    contractService = {
      simulateReadOnly: jest.fn(),
    } as any;

    service = new TicketReadService(contractService);
  });

  describe('getUserTickets', () => {
    it('should call simulateReadOnly for GET_USER_TICKETS', async () => {
      const params: GetUserTicketsParams = {
        raffleId: 1,
        userAddress: 'G...USER',
      };

      const mockTicketIds = [101, 105, 110];
      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: mockTicketIds });

      const result = await service.getUserTickets(params);

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_USER_TICKETS,
        [params.raffleId, params.userAddress],
      );
      expect(result.value).toEqual(mockTicketIds);
    });

    it('should validate raffleId', async () => {
      const params: GetUserTicketsParams = { raffleId: -1, userAddress: 'G...' };
      await expect(service.getUserTickets(params)).rejects.toThrow('raffleId must be a positive integer');
    });

    it('should validate raffleId is positive', async () => {
      const params: GetUserTicketsParams = { raffleId: 0, userAddress: 'G...' };
      await expect(service.getUserTickets(params)).rejects.toThrow('raffleId must be a positive integer');
    });

    it('should throw if userAddress is empty', async () => {
      const params: GetUserTicketsParams = { raffleId: 1, userAddress: '' };
      await expect(service.getUserTickets(params)).rejects.toThrow(TikkaSdkError);
      await expect(service.getUserTickets(params)).rejects.toThrow('userAddress must be a non-empty string');
    });

    it('should throw if userAddress is not a string', async () => {
      const params = { raffleId: 1, userAddress: null as any };
      await expect(service.getUserTickets(params)).rejects.toThrow(TikkaSdkError);
      await expect(service.getUserTickets(params)).rejects.toThrow('userAddress must be a non-empty string');
    });

    it('should return empty array for user with no tickets', async () => {
      const params: GetUserTicketsParams = {
        raffleId: 1,
        userAddress: 'G...NEWUSER',
      };

      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: [] });

      const result = await service.getUserTickets(params);

      expect(result.value).toEqual([]);
    });
  });

  describe('getUserTicketCount', () => {
    it('should return count of user tickets', async () => {
      const params: GetUserTicketsParams = {
        raffleId: 1,
        userAddress: 'G...USER',
      };

      const mockTicketIds = [101, 105, 110];
      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: mockTicketIds });

      const result = await service.getUserTicketCount(params);

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_USER_TICKETS,
        [params.raffleId, params.userAddress],
      );
      expect(result.value).toBe(3);
    });

    it('should return 0 for user with no tickets', async () => {
      const params: GetUserTicketsParams = {
        raffleId: 1,
        userAddress: 'G...NEWUSER',
      };

      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: [] });

      const result = await service.getUserTicketCount(params);

      expect(result.value).toBe(0);
    });

    it('should return 0 if value is undefined', async () => {
      const params: GetUserTicketsParams = {
        raffleId: 1,
        userAddress: 'G...USER',
      };

      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: undefined });

      const result = await service.getUserTicketCount(params);

      expect(result.value).toBe(0);
    });
  });
});

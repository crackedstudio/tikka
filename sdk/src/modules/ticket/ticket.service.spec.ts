import { TicketService } from './ticket.service';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { BuyTicketParams, RefundTicketParams, BuyBatchParams } from './ticket.types';
import { TikkaSdkError, TikkaSdkErrorCode } from '../../utils/errors';

describe('TicketService', () => {
  let service: TicketService;
  let contractService: jest.Mocked<ContractService>;
  let mockWallet: { getPublicKey: jest.Mock };

  beforeEach(() => {
    mockWallet = {
      getPublicKey: jest.fn().mockResolvedValue('G...ADDRESS'),
    };

    contractService = {
      invoke: jest.fn(),
      simulateReadOnly: jest.fn(),
      wallet: mockWallet,
    } as any;

    service = new TicketService(contractService);
  });

  describe('buy', () => {
    it('should invoke BUY_TICKET and return TicketIds', async () => {
      const params: BuyTicketParams = {
        raffleId: 1,
        quantity: 5,
      };

      const mockResult = {
        success: true,
        value: [101, 102, 103, 104, 105],
        transactionHash: 'tx-hash',
        ledger: 1000,
      };

      contractService.invoke.mockResolvedValue(mockResult);

      const result = await service.buy(params);

      expect(mockWallet.getPublicKey).toHaveBeenCalled();
      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.BUY_TICKET,
        [params.raffleId, 'G...ADDRESS', params.quantity],
        { memo: undefined },
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw if raffleId is invalid', async () => {
      const params: BuyTicketParams = { raffleId: 0, quantity: 1 };
      await expect(service.buy(params)).rejects.toThrow('raffleId must be a positive integer');
    });

    it('should throw if quantity is invalid', async () => {
      const params: BuyTicketParams = { raffleId: 1, quantity: -1 };
      await expect(service.buy(params)).rejects.toThrow('quantity must be a positive integer');
    });
  });

  describe('refund', () => {
    it('should invoke REFUND_TICKET', async () => {
      const params: RefundTicketParams = {
        raffleId: 1,
        ticketId: 101,
      };

      const mockInvokeResult = {
        success: true,
        value: undefined,
        transactionHash: 'refund-hash',
        ledger: 1001,
      };

      contractService.invoke.mockResolvedValue(mockInvokeResult);

      const result = await service.refund(params);

      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.REFUND_TICKET,
        [params.raffleId, params.ticketId],
        { memo: undefined },
      );
      expect(result).toEqual(mockInvokeResult);
    });

    it('should throw if ticketId is invalid', async () => {
      const params: RefundTicketParams = { raffleId: 1, ticketId: -5 };
      await expect(service.refund(params)).rejects.toThrow('ticketId must be a positive integer');
    });
  });

  describe('getUserTickets', () => {
    it('should call simulateReadOnly for GET_USER_TICKETS', async () => {
      const params = {
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
      const params = { raffleId: -1, userAddress: 'G...' };
      await expect(service.getUserTickets(params)).rejects.toThrow('raffleId must be a positive integer');
    });
  });

  describe('buyBatch', () => {
    it('should purchase tickets for multiple raffles', async () => {
      const params: BuyBatchParams = {
        purchases: [
          { raffleId: 1, quantity: 3 },
          { raffleId: 2, quantity: 5 },
        ],
      };

      // Mock simulation success for both
      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: [101, 102, 103] });

      // Mock invoke results
      contractService.invoke
        .mockResolvedValueOnce({
          success: true,
          value: [101, 102, 103],
          transactionHash: 'tx-hash-1',
          ledger: 1000,
        })
        .mockResolvedValueOnce({
          success: true,
          value: [201, 202, 203, 204, 205],
          transactionHash: 'tx-hash-2',
          ledger: 1001,
        });

      const result = await service.buyBatch(params);

      expect(mockWallet.getPublicKey).toHaveBeenCalled();
      expect(contractService.simulateReadOnly).toHaveBeenCalledTimes(2);
      expect(contractService.invoke).toHaveBeenCalledTimes(2);
      
      expect(result.value).toHaveLength(2);
      expect(result.value![0]).toEqual({
        raffleId: 1,
        ticketIds: [101, 102, 103],
        success: true,
      });
      expect(result.value![1]).toEqual({
        raffleId: 2,
        ticketIds: [201, 202, 203, 204, 205],
        success: true,
      });
      expect(result.transactionHash).toBe('tx-hash-2');
      expect(result.ledger).toBe(1001);
    });

    it('should handle partial failures gracefully', async () => {
      const params: BuyBatchParams = {
        purchases: [
          { raffleId: 1, quantity: 3 },
          { raffleId: 2, quantity: 5 },
        ],
      };

      // First simulation succeeds, second fails
      contractService.simulateReadOnly
        .mockResolvedValueOnce({ success: true, value: [101, 102, 103] })
        .mockRejectedValueOnce(new Error('Raffle not found'));

      // Only first invoke should happen
      contractService.invoke.mockResolvedValueOnce({
        success: true,
        value: [101, 102, 103],
        transactionHash: 'tx-hash-1',
        ledger: 1000,
      });

      const result = await service.buyBatch(params);

      expect(result.value).toHaveLength(2);
      expect(result.value![0].success).toBe(true);
      expect(result.value![1].success).toBe(false);
      expect(result.value![1].error).toContain('Raffle not found');
    });

    it('should throw if purchases array is empty', async () => {
      const params: BuyBatchParams = { purchases: [] };
      
      await expect(service.buyBatch(params)).rejects.toThrow(
        TikkaSdkError
      );
    });

    it('should validate each purchase in the batch', async () => {
      const params: BuyBatchParams = {
        purchases: [
          { raffleId: 1, quantity: 3 },
          { raffleId: -1, quantity: 5 }, // Invalid raffleId
        ],
      };

      await expect(service.buyBatch(params)).rejects.toThrow(
        'Invalid purchase at index 1'
      );
    });

    it('should throw if all purchases fail simulation', async () => {
      const params: BuyBatchParams = {
        purchases: [
          { raffleId: 1, quantity: 3 },
          { raffleId: 2, quantity: 5 },
        ],
      };

      contractService.simulateReadOnly.mockRejectedValue(
        new Error('All raffles closed')
      );

      await expect(service.buyBatch(params)).rejects.toThrow(
        'All batch purchases failed simulation'
      );
    });

    it('should pass memo to individual purchases', async () => {
      const params: BuyBatchParams = {
        purchases: [{ raffleId: 1, quantity: 3 }],
        memo: { type: 'text', value: 'Batch purchase' },
      };

      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: [101, 102, 103] });
      contractService.invoke.mockResolvedValue({
        success: true,
        value: [101, 102, 103],
        transactionHash: 'tx-hash',
        ledger: 1000,
      });

      await service.buyBatch(params);

      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.BUY_TICKET,
        [1, 'G...ADDRESS', 3],
        { memo: params.memo },
      );
    });
  });
});

import { TicketService } from './ticket.service';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { BuyTicketParams, RefundTicketParams } from './ticket.types';

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
        result: [101, 102, 103, 104, 105],
        txHash: 'tx-hash',
        ledger: 1000,
      };

      contractService.invoke.mockResolvedValue(mockResult);

      const result = await service.buy(params);

      expect(mockWallet.getPublicKey).toHaveBeenCalled();
      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.BUY_TICKET,
        [params.raffleId, 'G...ADDRESS', params.quantity],
      );
      expect(result).toEqual({
        ticketIds: mockResult.result,
        txHash: mockResult.txHash,
        ledger: mockResult.ledger,
        feePaid: '0',
      });
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
        result: undefined,
        txHash: 'refund-hash',
        ledger: 1001,
      };

      contractService.invoke.mockResolvedValue(mockInvokeResult);

      const result = await service.refund(params);

      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.REFUND_TICKET,
        [params.raffleId, params.ticketId],
      );
      expect(result).toEqual({
        txHash: 'refund-hash',
        ledger: 1001,
      });
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
      contractService.simulateReadOnly.mockResolvedValue(mockTicketIds);

      const result = await service.getUserTickets(params);

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_USER_TICKETS,
        [params.raffleId, params.userAddress],
      );
      expect(result).toEqual(mockTicketIds);
    });

    it('should validate raffleId', async () => {
      const params = { raffleId: -1, userAddress: 'G...' };
      await expect(service.getUserTickets(params)).rejects.toThrow('raffleId must be a positive integer');
    });
  });
});

import { UserService } from './user.service';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';

describe('UserService', () => {
  let service: UserService;
  let contractService: jest.Mocked<ContractService>;

  const VALID_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  const mockContractData = {
    total_raffles_entered: 5,
    total_tickets_bought: 12,
    total_raffles_won: 1,
    raffle_ids: [1, 3, 7, 9, 11],
  };

  beforeEach(() => {
    contractService = { simulateReadOnly: jest.fn() } as any;
    service = new UserService(contractService);
  });

  describe('getParticipation', () => {
    it('should call GET_USER_PARTICIPATION with the address', async () => {
      contractService.simulateReadOnly.mockResolvedValue(mockContractData);

      await service.getParticipation({ address: VALID_ADDRESS });

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_USER_PARTICIPATION,
        [VALID_ADDRESS],
      );
    });

    it('should map contract data to UserParticipation', async () => {
      contractService.simulateReadOnly.mockResolvedValue(mockContractData);

      const result = await service.getParticipation({ address: VALID_ADDRESS });

      expect(result).toEqual({
        address: VALID_ADDRESS,
        totalRafflesEntered: 5,
        totalTicketsBought: 12,
        totalRafflesWon: 1,
        raffleIds: [1, 3, 7, 9, 11],
      });
    });

    it('should throw ValidationError for an invalid address', async () => {
      await expect(
        service.getParticipation({ address: 'not-a-stellar-key' }),
      ).rejects.toThrow('Invalid Stellar public key');
    });

    it('should throw ValidationError for an empty address', async () => {
      await expect(
        service.getParticipation({ address: '' }),
      ).rejects.toThrow('Invalid Stellar public key');
    });

    it('should propagate contract errors', async () => {
      contractService.simulateReadOnly.mockRejectedValue(new Error('RPC error'));

      await expect(
        service.getParticipation({ address: VALID_ADDRESS }),
      ).rejects.toThrow('RPC error');
    });
  });
});

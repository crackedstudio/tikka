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
      contractService.simulateReadOnly.mockResolvedValue({ status: 'SUCCESS' as const, value: mockContractData });

      await service.getParticipation({ address: VALID_ADDRESS });

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_USER_PARTICIPATION,
        [VALID_ADDRESS],
      );
    });

    it('should map contract data to UserParticipation', async () => {
      contractService.simulateReadOnly.mockResolvedValue({ status: 'SUCCESS' as const, value: mockContractData });

      const result = await service.getParticipation({ address: VALID_ADDRESS });
      expect(result.status).toBe('SUCCESS');
      expect(result.value).toEqual({
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

describe('UserService.getWinnings', () => {
  const WINNER = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  function buildService() {
    const contractService = {
      simulateReadOnly: jest.fn(),
    } as unknown as jest.Mocked<ContractService>;
    return { service: new UserService(contractService as any), contractService };
  }

  it('returns claimed: false for an unclaimed prize', async () => {
    const { service, contractService } = buildService();

    // First call: GET_USER_PARTICIPATION
    contractService.simulateReadOnly
      .mockResolvedValueOnce({
        success: true,
        value: {
          total_raffles_entered: 1,
          total_tickets_bought: 2,
          total_raffles_won: 1,
          raffle_ids: [42],
        },
      })
      // Second call: GET_RAFFLE_DATA (for activity summary — winner present)
      .mockResolvedValueOnce({
        success: true,
        value: {
          creator: 'GCREATORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          status: 2, // Finalized
          winner: WINNER,
          prize_amount: '1000',
          asset: 'XLM',
          ticket_price: '100',
          max_tickets: 50,
          tickets_sold: 10,
          end_time: Date.now() - 1000,
          allow_multiple: false,
          metadata_cid: '',
        },
      })
      // Third call: GET_USER_TICKETS (for activity summary)
      .mockResolvedValueOnce({ success: true, value: [1, 2] })
      // Fourth call: GET_RAFFLE_DATA again (inside getWinnings claim check)
      .mockResolvedValueOnce({
        success: true,
        value: {
          winner: WINNER, // still the winner — not yet claimed
          asset: 'XLM',
        },
      });

    const result = await service.getWinnings(WINNER);

    expect(result.success).toBe(true);
    expect(result.value).toHaveLength(1);
    expect(result.value![0]).toMatchObject({
      raffleId: 42,
      prizeAmount: '1000',
      prizeAsset: 'XLM',
      claimed: false,
    });
  });

  it('returns claimed: true when the prize was already claimed', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly
      .mockResolvedValueOnce({
        success: true,
        value: {
          total_raffles_entered: 1,
          total_tickets_bought: 2,
          total_raffles_won: 1,
          raffle_ids: [42],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        value: {
          creator: 'GCREATORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          status: 2,
          winner: WINNER,
          prize_amount: '1000',
          asset: 'XLM',
          ticket_price: '100',
          max_tickets: 50,
          tickets_sold: 10,
          end_time: Date.now() - 1000,
          allow_multiple: false,
          metadata_cid: '',
        },
      })
      .mockResolvedValueOnce({ success: true, value: [1, 2] })
      // Claim-check call: winner field is different — prize was claimed
      .mockResolvedValueOnce({
        success: true,
        value: {
          winner: 'GDIFFERENTADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          asset: 'XLM',
        },
      });

    const result = await service.getWinnings(WINNER);

    expect(result.success).toBe(true);
    expect(result.value![0].claimed).toBe(true);
  });
});

import { UserService } from './user.service';
import { ContractService } from '../../contract/contract.service';
import { ContractFn, RaffleStatus } from '../../contract/bindings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
const CREATOR_ADDRESS = 'GCREATORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const WINNER_ADDRESS  = 'GWINNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function makeParticipation(raffleIds: number[]) {
  return {
    success: true,
    value: {
      total_raffles_entered: raffleIds.length,
      total_tickets_bought: raffleIds.length * 2,
      total_raffles_won: 0,
      raffle_ids: raffleIds,
    },
  };
}

function makeRaffle(overrides: Partial<any> = {}) {
  return {
    success: true,
    value: {
      creator: CREATOR_ADDRESS,
      status: RaffleStatus.Open,
      ticket_price: '100',
      max_tickets: 50,
      tickets_sold: 2,
      end_time: Date.now() + 3_600_000,
      asset: 'XLM',
      allow_multiple: false,
      metadata_cid: '',
      winner: undefined,
      winning_ticket_id: undefined,
      prize_amount: undefined,
      ...overrides,
    },
  };
}

function buildService() {
  const contractService = {
    simulateReadOnly: jest.fn(),
  } as unknown as jest.Mocked<ContractService>;

  return { service: new UserService(contractService as any), contractService };
}

// ─── Empty user ───────────────────────────────────────────────────────────────

describe('UserService.getActivitySummary — empty user', () => {
  it('returns empty aggregates for a user with no raffle activity', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly.mockResolvedValue({
      success: true,
      value: {
        total_raffles_entered: 0,
        total_tickets_bought: 0,
        total_raffles_won: 0,
        raffle_ids: [],
      },
    });

    const result = await service.getActivitySummary({ address: VALID_ADDRESS });

    expect(result.success).toBe(true);
    expect(result.value!.raffles).toHaveLength(0);
    expect(result.value!.tickets).toHaveLength(0);
    expect(result.value!.wonRaffleIds).toHaveLength(0);
    expect(result.value!.createdRaffleIds).toHaveLength(0);
    expect(result.value!.totals).toEqual({
      rafflesEntered: 0,
      ticketsBought: 0,
      rafflesWon: 0,
      rafflesCreated: 0,
    });
  });
});

// ─── Active participant ───────────────────────────────────────────────────────

describe('UserService.getActivitySummary — active participant', () => {
  it('aggregates raffles and tickets for a participant with 2 raffles', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly
      // getParticipation
      .mockResolvedValueOnce({
        success: true,
        value: {
          total_raffles_entered: 2,
          total_tickets_bought: 3,
          total_raffles_won: 0,
          raffle_ids: [1, 2],
        },
      })
      // GET_RAFFLE_DATA for raffle 1
      .mockResolvedValueOnce(makeRaffle({ status: RaffleStatus.Open }))
      // GET_USER_TICKETS for raffle 1
      .mockResolvedValueOnce({ success: true, value: [10, 11] })
      // GET_RAFFLE_DATA for raffle 2
      .mockResolvedValueOnce(makeRaffle({ status: RaffleStatus.Open }))
      // GET_USER_TICKETS for raffle 2
      .mockResolvedValueOnce({ success: true, value: [22] });

    const result = await service.getActivitySummary({ address: VALID_ADDRESS });

    expect(result.success).toBe(true);
    expect(result.value!.raffles).toHaveLength(2);
    expect(result.value!.tickets).toHaveLength(3);
    expect(result.value!.totals.ticketsBought).toBe(3);
    expect(result.value!.totals.rafflesEntered).toBe(2);
  });
});

// ─── Creator ──────────────────────────────────────────────────────────────────

describe('UserService.getActivitySummary — creator', () => {
  it('marks raffle as created when address matches creator', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly
      .mockResolvedValueOnce({
        success: true,
        value: {
          total_raffles_entered: 1,
          total_tickets_bought: 1,
          total_raffles_won: 0,
          raffle_ids: [5],
        },
      })
      .mockResolvedValueOnce(makeRaffle({ creator: VALID_ADDRESS }))
      .mockResolvedValueOnce({ success: true, value: [1] });

    const result = await service.getActivitySummary({ address: VALID_ADDRESS });

    expect(result.value!.createdRaffleIds).toContain(5);
    expect(result.value!.raffles[0].isCreator).toBe(true);
    expect(result.value!.totals.rafflesCreated).toBe(1);
  });
});

// ─── Winner ───────────────────────────────────────────────────────────────────

describe('UserService.getActivitySummary — winner', () => {
  it('marks raffle as won and includes prizeAmount when user is the winner', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly
      .mockResolvedValueOnce({
        success: true,
        value: {
          total_raffles_entered: 1,
          total_tickets_bought: 2,
          total_raffles_won: 1,
          raffle_ids: [7],
        },
      })
      .mockResolvedValueOnce(
        makeRaffle({
          status: RaffleStatus.Finalized,
          winner: VALID_ADDRESS,
          prize_amount: BigInt(5000),
        }),
      )
      .mockResolvedValueOnce({ success: true, value: [3, 4] });

    const result = await service.getActivitySummary({ address: VALID_ADDRESS });

    expect(result.value!.wonRaffleIds).toContain(7);
    expect(result.value!.raffles[0].isWinner).toBe(true);
    expect(result.value!.raffles[0].prizeAmount).toBe('5000');
    expect(result.value!.totals.rafflesWon).toBe(1);
  });
});

// ─── Refunded ticket (indexer field) ─────────────────────────────────────────

describe('UserService.getActivitySummary — refunded ticket', () => {
  it('leaves refundedTicketIds undefined when indexer data not requested', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly.mockResolvedValue({
      success: true,
      value: {
        total_raffles_entered: 0,
        total_tickets_bought: 0,
        total_raffles_won: 0,
        raffle_ids: [],
      },
    });

    const result = await service.getActivitySummary({ address: VALID_ADDRESS });

    expect(result.value!.refundedTicketIds).toBeUndefined();
    expect(result.value!.totalRefunded).toBeUndefined();
  });
});

// ─── getTickets ───────────────────────────────────────────────────────────────

describe('UserService.getTickets', () => {
  it('returns all tickets across multiple raffles', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly
      .mockResolvedValueOnce({
        success: true,
        value: {
          total_raffles_entered: 2,
          total_tickets_bought: 3,
          total_raffles_won: 0,
          raffle_ids: [1, 2],
        },
      })
      .mockResolvedValueOnce({ success: true, value: [10, 11] })
      .mockResolvedValueOnce({ success: true, value: [22] });

    const result = await service.getTickets(VALID_ADDRESS);

    expect(result.success).toBe(true);
    expect(result.value).toEqual([
      { ticketId: 10, raffleId: 1 },
      { ticketId: 11, raffleId: 1 },
      { ticketId: 22, raffleId: 2 },
    ]);
  });

  it('returns empty array for a user with no raffles', async () => {
    const { service, contractService } = buildService();

    contractService.simulateReadOnly.mockResolvedValue({
      success: true,
      value: {
        total_raffles_entered: 0,
        total_tickets_bought: 0,
        total_raffles_won: 0,
        raffle_ids: [],
      },
    });

    const result = await service.getTickets(VALID_ADDRESS);

    expect(result.success).toBe(true);
    expect(result.value).toEqual([]);
  });

  it('throws validation error for invalid address', async () => {
    const { service } = buildService();
    await expect(service.getTickets('bad-key')).rejects.toThrow(
      'Invalid Stellar public key',
    );
  });
});

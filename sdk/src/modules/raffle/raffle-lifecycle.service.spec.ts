import { RaffleService } from './raffle.service';
import { ContractService } from '../../contract/contract.service';
import { ContractFn, RaffleStatus } from '../../contract/bindings';
import { RaffleStateError, TriggerDrawParams } from './raffle.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRaffleData(status: RaffleStatus, overrides: Partial<any> = {}) {
  return {
    success: true,
    value: {
      raffleId: 1,
      creator: 'GCREATOR',
      status,
      ticketPrice: '100',
      maxTickets: 50,
      ticketsSold: 10,
      endTime: Date.now() + 3_600_000,
      asset: 'XLM',
      allowMultiple: false,
      metadataCid: '',
      ...overrides,
    },
  };
}

function buildService() {
  const contractService = {
    invoke: jest.fn(),
    simulateReadOnly: jest.fn(),
  } as unknown as jest.Mocked<ContractService>;

  const feeEstimator = {
    estimateFee: jest.fn(),
    estimateFromResourceFee: jest.fn(),
  } as any;

  const service = new RaffleService(contractService as any, feeEstimator);
  return { service, contractService };
}

// ─── triggerDraw ──────────────────────────────────────────────────────────────

describe('RaffleService.triggerDraw', () => {
  it('invokes TRIGGER_DRAW when raffle is Open', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Open),
    );
    contractService.invoke.mockResolvedValue({
      success: true,
      value: { txHash: 'hash1', ledger: 99 },
    });

    const result = await service.triggerDraw({ raffleId: 1 });

    expect(contractService.invoke).toHaveBeenCalledWith(
      ContractFn.TRIGGER_DRAW,
      [1],
      { memo: undefined },
    );
    expect(result.success).toBe(true);
  });

  it('throws RaffleStateError when raffle is already Drawing', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Drawing),
    );

    await expect(service.triggerDraw({ raffleId: 1 })).rejects.toBeInstanceOf(
      RaffleStateError,
    );
  });

  it('throws RaffleStateError when raffle is Finalized', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Finalized),
    );

    const err = await service
      .triggerDraw({ raffleId: 1 })
      .catch((e) => e);

    expect(err).toBeInstanceOf(RaffleStateError);
    expect((err as RaffleStateError).attempted).toBe('open→drawing');
    expect((err as RaffleStateError).currentStatus).toBe(RaffleStatus.Finalized);
  });

  it('throws RaffleStateError when raffle is Cancelled', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Cancelled),
    );

    await expect(service.triggerDraw({ raffleId: 1 })).rejects.toBeInstanceOf(
      RaffleStateError,
    );
  });

  it('throws validation error for raffleId = 0', async () => {
    const { service } = buildService();
    await expect(service.triggerDraw({ raffleId: 0 })).rejects.toThrow(
      'raffleId must be a positive integer',
    );
  });

  it('passes memo to invoke', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Open),
    );
    contractService.invoke.mockResolvedValue({ success: true, value: {} });

    await service.triggerDraw({
      raffleId: 1,
      memo: { type: 'text', value: 'oracle-trigger' },
    } as TriggerDrawParams);

    expect(contractService.invoke).toHaveBeenCalledWith(
      ContractFn.TRIGGER_DRAW,
      [1],
      { memo: { type: 'text', value: 'oracle-trigger' } },
    );
  });
});

// ─── getWinner ────────────────────────────────────────────────────────────────

describe('RaffleService.getWinner', () => {
  it('returns winner data for a finalized raffle', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Finalized, {
        winner: 'GWINNER',
        winningTicketId: 7,
        prizeAmount: '5000',
      }),
    );

    const result = await service.getWinner(1);

    expect(result.success).toBe(true);
    expect(result.value).toEqual({
      raffleId: 1,
      winner: 'GWINNER',
      winningTicketId: 7,
      prizeAmount: '5000',
    });
  });

  it('returns null value for an open raffle (not finalized)', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Open),
    );

    const result = await service.getWinner(1);

    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });

  it('returns null value for a drawing raffle', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Drawing),
    );

    const result = await service.getWinner(1);

    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });

  it('returns null when raffle is finalized but winner field missing', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Finalized, { winner: undefined }),
    );

    const result = await service.getWinner(1);

    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });

  it('throws validation error for raffleId = 0', async () => {
    const { service } = buildService();
    await expect(service.getWinner(0)).rejects.toThrow(
      'raffleId must be a positive integer',
    );
  });
});

// ─── cancel — state guard ─────────────────────────────────────────────────────

describe('RaffleService.cancel — state guard', () => {
  it('invokes CANCEL_RAFFLE when raffle is Open', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Open),
    );
    contractService.invoke.mockResolvedValue({ success: true, value: undefined });

    await service.cancel({ raffleId: 1 });

    expect(contractService.invoke).toHaveBeenCalledWith(
      ContractFn.CANCEL_RAFFLE,
      [1],
      { memo: undefined },
    );
  });

  it('throws RaffleStateError when trying to cancel a Drawing raffle', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Drawing),
    );

    const err = await service.cancel({ raffleId: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(RaffleStateError);
    expect((err as RaffleStateError).attempted).toBe('open→cancelled');
  });

  it('throws RaffleStateError when trying to cancel an already-cancelled raffle', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Cancelled),
    );

    await expect(service.cancel({ raffleId: 1 })).rejects.toBeInstanceOf(
      RaffleStateError,
    );
  });

  it('throws RaffleStateError when trying to cancel a finalized raffle', async () => {
    const { service, contractService } = buildService();
    contractService.simulateReadOnly.mockResolvedValue(
      makeRaffleData(RaffleStatus.Finalized),
    );

    await expect(service.cancel({ raffleId: 1 })).rejects.toBeInstanceOf(
      RaffleStateError,
    );
  });
});

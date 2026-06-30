/**
 * Unit tests: contract lifecycle validation before transaction submission.
 * Issue: #929
 *
 * Covers:
 *  1. buyTickets on DRAWING raffle throws RaffleEnded without submitting
 *  2. buyTickets on OPEN raffle proceeds normally
 *  3. finalizeRaffle on DRAWING raffle throws RaffleEnded
 *  4. finalizeRaffle on OPEN raffle proceeds normally
 *  5. cancelRaffle on FINALIZED raffle throws RaffleEnded
 *  6. cancelRaffle on OPEN raffle proceeds normally
 *  7. validateLifecycleTransition unit tests (all invalid transitions)
 *  8. validateLifecycleTransition passes for valid transitions
 */

import { TicketService } from '../ticket/ticket.service';
import { AdminService } from '../admin/admin.service';
import { ContractService } from '../../contract/contract.service';
import { ContractFn, RaffleStatus } from '../../contract/bindings';
import { validateLifecycleTransition } from '../../contract/lifecycle';
import { TikkaSdkError, TikkaSdkErrorCode } from '../../utils/errors';
import { BuyTicketParams } from '../ticket/ticket.types';

const RAFFLE_ID = 42;
const PUBLIC_KEY = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEF';

function makeContractService(stateValue: number) {
  const mockWallet = { getPublicKey: jest.fn().mockResolvedValue(PUBLIC_KEY) };
  const cs = {
    invoke: jest.fn().mockResolvedValue({
      status: 'SUCCESS',
      value: [1, 2, 3],
      txHash: 'TX_HASH',
      ledger: 1000,
      feePaid: '100',
    }),
    simulateReadOnly: jest.fn().mockResolvedValue({
      status: 'SUCCESS',
      value: { status: stateValue },
    }),
    wallet: mockWallet,
  } as unknown as jest.Mocked<ContractService>;
  return cs;
}

// ── TicketService.buy() ───────────────────────────────────────────────────────

describe('TicketService.buy() — lifecycle validation', () => {
  const params: BuyTicketParams = {onst cs = makeContractService(RaffleStatus.Drawing);
    const service = new TicketService(cs);

    await expect(service.buy(params)).rejects.toThrow(TikkaSdkError);
    await expect(service.buy(params)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.RaffleEnded,
    });
    expect(cs.invoke).not.toHaveBeenCalled();
  });

  it('throws RaffleEnded when raffle is FINALIZED', async () => {
    const cs = makeContractService(RaffleStatus.Finalized);
    const service = new TicketService(cs);

    await expect(service.buy(params)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.RaffleEnded,
    });
    expect(cs.invoke).not.toHaveBeenCalled();
  });

  it('throws RaffleEnded when raffle is CANCELLED', async () => {
    const cs = makeContractService(RaffleStatus.Cancelled);
    const service = new TicketService(cs);

    await expect(service.buy(params)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.RaffleEnded,
    });
    expect(cs.invoke).not.toHaveBeenCalled();
  });

  it('proceeds and calls invoke when raffle is OPEN', async () => {
    const cs = makeContractService(RaffleStatus.Open);
    const service = new TicketService(cs);

    const result = await service.buy(params);

    expect(cs.simulateReadOnly).toHaveBeenCalledWith(
      ContractFn.GET_RAFFLE_STATE,
      [RAFFLE_ID],
    );
    expect(cs.invoke).toHaveBeenCalled();
    expect(result.value?.ticketIds).toEqual([1, 2, 3]);
  });

  it('fetches state before any RPC transaction call', async () => {
    const cs = makeContractService(RaffleStatus.Open);
    const callOrder: string[] = [];
    cs.simulateReadOnly.mockImplementation(async () => {
      callOrder.push('simulateReadOnly');
      return { status: 'SUCCESS', value: { status: RaffleStatus.Open } };
    });
    cs.invoke.mockImplementation(async () => {
      callOrder.push('invoke');
      return { status: 'SUCCESS', value: [1], txHash: 'TX', ledger: 1, feePaid: '0' };
    });

    const service = new TicketService(cs);
    await service.buy(params);

    expect(callOrder[0]).toBe('simulateReadOnly');
    expect(callOrder[1]).toBe('invoke');
  });
});

// ── AdminService.finalizeRaffle() ─────────────────────────────────────────────

describe('AdminService.finalizeRaffle() — lifecycle validation', () => {
  it('throws RaffleEnded when raffle is already DRAWING', async () => {
    const cs = makeContractService(RaffleStatus.Drawing);
    const service = new AdminService(cs as any);

    await expect(service.finalizeRaffle(RAFFLE_ID)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.RaffleEnded,
    });
    expect(cs.invoke).not.toHaveBeenCalled();
  });

  it('proceeds when raffle is OPEN', async () => {
    const cs = makeContractService(RaffleStatus.Open);
    cs.invoke.mockResolvedValue({ status: 'SUCCESS', value: null, txHash: 'TX', ledger: 1 });
    const service = new AdminService(cs as any);

    await service.finalizeRaffle(RAFFLE_ID);

    expect(cs.invoke).toHa  );
  });
});

// ── AdminService.cancelRaffle() ───────────────────────────────────────────────

describe('AdminService.cancelRaffle() — lifecycle validation', () => {
  it('throws RaffleEnded when raffle is FINALIZED', async () => {
    const cs = makeContractService(RaffleStatus.Finalized);
    const service = new AdminService(cs as any);

    await expect(service.cancelRaffle(RAFFLE_ID)).rejects.toMatchObject({
      code: TikkaSdkErrorCode.RaffleEnded,
    });
    expect(cs.invoke).not.toHaveBeenCalled();
  });

  it('proceeds when raffle is OPEN', async () => {
    const cs = makeContractService(RaffleStatus.Open);
    cs.invoke.mockResolvedValue({ status: 'SUCCESS', value: null, txHash: 'TX', ledger: 1 });
    const service = new AdminService(cs as any);

    await service.cancelRaffle(RAFFLE_ID);

    expect(cs.invoke).toHaveBeenCalledWith(
      ContractFn.CANCEL_RAFFLE,
      [RAFFLE_ID],
      exp────────────────

describe('validateLifecycleTransition', () => {
  it('throws RaffleEnded for buy_ticket on DRAWING state', () => {
    expect(() =>
      validateLifecycleTransition('buy_ticket', RaffleStatus.Drawing, RAFFLE_ID)
    ).toThrow(TikkaSdkError);
    expect(() =>
      validateLifecycleTransition('buy_ticket', RaffleStatus.Drawing, RAFFLE_ID)
    ).toThrowError(expect.objectContaining({ code: TikkaSdkErrorCode.RaffleEnded }));
  });

  it('throws RaffleEnded for buy_ticket on FINALIZED state', () => {
    expect(() =>
      validateLifecycleTransition('buy_ticket', RaffleStatus.Finalized, RAFFLE_ID)
    ).toThrowError(expect.objectContaining({ code: TikkaSdkErrorCode.RaffleEnded }));
  });

  it('throws RaffleEnded for buy_ticket on CANCELLED state', () => {
    expect(() =>
      validateLifecycleTransition('buy_ticket', RaffleStatus.Cancelled, RAFFLE_ID)
    ).toThrowError(expect.objectContaining({ code: TikkaSdkErrorCode.RaffleEnded }));
  });

  it('does NOTate', () => {
    expect(() =>
      validateLifecycleTransition('buy_ticket', RaffleStatus.Open, RAFFLE_ID)
    ).not.toThrow();
  });

  it('does NOT throw for unknown operations (no requirement defined)', () => {
    expect(() =>
      validateLifecycleTransition('get_admin', RaffleStatus.Drawing, RAFFLE_ID)
    ).not.toThrow();
  });

  it('error message includes raffle ID and state names', () => {
    let msg = '';
    try {
      validateLifecycleTransition('buy_ticket', RaffleStatus.Drawing, RAFFLE_ID);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain(String(RAFFLE_ID));
    expect(msg).toMatch(/DRAWING/i);
    expect(msg).toMatch(/OPEN/i);
  });
});

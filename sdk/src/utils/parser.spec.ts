import { TransactionHistoryParser } from './parser';
import { xdr, nativeToScVal } from '@stellar/stellar-sdk';

describe('TransactionHistoryParser', () => {
  let fromXdrSpy: jest.SpyInstance;

  beforeEach(() => {
    fromXdrSpy = jest.spyOn(xdr.TransactionMeta, 'fromXDR');
  });

  afterEach(() => {
    fromXdrSpy.mockRestore();
  });

  /**
   * Helper to create a mock ContractEvent.
   */
  function createMockEvent(name: string, raffleId: number, actor: string | null, value: any) {
    const topics = [nativeToScVal(name), nativeToScVal(raffleId)];
    if (actor) {
      topics.push(nativeToScVal(actor));
    }

    return {
      body: () => ({
        switch: () => ({ value: 0 }), // v0
        arm: () => 'v0',
        v0: () => ({
          topics: () => topics,
          data: () => nativeToScVal(value),
        }),
      }),
    } as any;
  }

  it('should parse RaffleCreated event', () => {
    const raffleId = 42;
    const creator = 'G...ADDRESS';
    const params = { price: 500, max_tickets: 100 };

    const mockEvent = createMockEvent('RaffleCreated', raffleId, creator, params);

    fromXdrSpy.mockReturnValue({
      switch: () => ({ value: 3 }), // v3
      arm: () => 'v3',
      v3: () => ({
        sorobanMeta: () => ({
          events: () => [mockEvent],
        }),
      }),
    } as any);

    const result = TransactionHistoryParser.parseResult('mock-xdr');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'RaffleCreated',
      raffleId: raffleId,
      creator: creator,
      price: 500n,
      max_tickets: 100n,
    });
  });

  it('should parse TicketPurchased event', () => {
    const raffleId = 1;
    const buyer = 'G...BUYER';
    const ticketIds = [101, 102];
    const data = { ticket_ids: ticketIds, total_paid: 200n };

    const mockEvent = createMockEvent('TicketPurchased', raffleId, buyer, data);

    fromXdrSpy.mockReturnValue({
      switch: () => ({ value: 3 }),
      arm: () => 'v3',
      v3: () => ({
        sorobanMeta: () => ({
          events: () => [mockEvent],
        }),
      }),
    } as any);

    const result = TransactionHistoryParser.parseResult('mock-xdr');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'TicketPurchased',
      raffleId: raffleId,
      buyer: buyer,
      ticketIds: ticketIds,
      totalPaid: '200',
    });
  });

  it('should return empty array for non-v3 meta', () => {
    fromXdrSpy.mockReturnValue({
      switch: () => ({ value: 0 }),
      arm: () => 'v0',
    } as any);

    const result = TransactionHistoryParser.parseResult('mock-xdr');
    expect(result).toEqual([]);
  });

  it('should handle invalid XDR by returning empty array', () => {
    fromXdrSpy.mockImplementation(() => {
      throw new Error('Invalid XDR');
    });

    const result = TransactionHistoryParser.parseResult('bad-xdr');
    expect(result).toEqual([]);
  });
});

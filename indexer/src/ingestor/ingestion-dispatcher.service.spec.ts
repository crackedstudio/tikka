import { IngestionDispatcherService } from './ingestion-dispatcher.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';
import { DomainEvent } from './event.types';

describe('IngestionDispatcherService', () => {
  function makeService() {
    const raffleProcessor = {
      handleRaffleCreated: jest.fn().mockResolvedValue(undefined),
      handleRaffleFinalized: jest.fn().mockResolvedValue(undefined),
      handleRaffleCancelled: jest.fn().mockResolvedValue(undefined),
    };
    const ticketProcessor = {
      handleTicketPurchased: jest.fn().mockResolvedValue(undefined),
      handleTicketRefunded: jest.fn().mockResolvedValue(undefined),
    };
    const adminProcessor = {
      handleContractPaused: jest.fn().mockResolvedValue(undefined),
      handleContractUnpaused: jest.fn().mockResolvedValue(undefined),
      handleAdminTransferProposed: jest.fn().mockResolvedValue(undefined),
      handleAdminTransferAccepted: jest.fn().mockResolvedValue(undefined),
    };
    const dlq = new DeadLetterQueueService();
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {},
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    };

    dlq.clear();

    return {
      service: new IngestionDispatcherService(
        dataSource as any,
        raffleProcessor as any,
        ticketProcessor as any,
        adminProcessor as any,
        dlq,
      ),
      raffleProcessor,
      ticketProcessor,
      adminProcessor,
      dlq,
    };
  }

  const raw = {
    id: 'tx-1',
    ledger: 123,
    paging_token: 'paging-1',
    contract_id: 'contract-1',
  };

  it('isolates one failed handler while later events still run', async () => {
    const { service, raffleProcessor, ticketProcessor, dlq } = makeService();
    ticketProcessor.handleTicketPurchased.mockRejectedValueOnce(
      new Error('ticket write failed'),
    );

    const events: DomainEvent[] = [
      {
        type: 'TicketPurchased',
        raffle_id: 1,
        buyer: 'GBUYER',
        ticket_ids: [1],
        total_paid: '100',
      },
      {
        type: 'RaffleCancelled',
        raffle_id: 1,
        reason: 'expired',
      },
    ];

    const results = await service.dispatchMany([
      { event: events[0], rawEvent: raw },
      { event: events[1], rawEvent: { ...raw, id: 'tx-2', ledger: 124 } },
    ]);

    expect(results.map((result) => result.outcome)).toEqual([
      'failed',
      'succeeded',
    ]);
    expect(raffleProcessor.handleRaffleCancelled).toHaveBeenCalledWith(
      1,
      'expired',
      124,
      'tx-2',
    );
    expect(dlq.getRecords()).toHaveLength(1);
    expect(dlq.getRecords()[0]).toMatchObject({
      handlerName: 'TicketProcessor.handleTicketPurchased',
      eventId: 'tx-1',
      eventType: 'TicketPurchased',
      ledger: 123,
      txHash: 'tx-1',
      errorMessage: 'ticket write failed',
      event: events[0],
      rawEvent: raw,
    });
  });

  it('logs handler name, event id, outcome, and duration', async () => {
    const { service } = makeService();
    const logger = (service as any).logger;
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();

    const result = await service.dispatch(
      {
        type: 'RaffleCreated',
        raffle_id: 99,
        creator: 'GCREATOR',
        params: {
          ticket_price: '1',
          max_tickets: 10,
          end_time: 1,
          asset: 'XLM',
          metadata_cid: '',
          allow_multiple: true,
        },
      },
      raw,
    );

    expect(result).toMatchObject({
      handlerName: 'RaffleProcessor.handleRaffleCreated',
      eventId: 'tx-1',
      eventType: 'RaffleCreated',
      outcome: 'succeeded',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'handler=RaffleProcessor.handleRaffleCreated eventId=tx-1 outcome=succeeded durationMs=',
      ),
    );
  });

  describe('schema versioning', () => {
    it('processes a supported (v1) event normally', async () => {
      const { service, raffleProcessor } = makeService();

      const result = await service.dispatch(
        {
          type: 'RaffleCancelled',
          schemaVersion: 1,
          raffle_id: 1,
          reason: 'expired',
        },
        raw,
      );

      expect(result.outcome).toBe('succeeded');
      expect(raffleProcessor.handleRaffleCancelled).toHaveBeenCalled();
    });

    it('dead-letters an unsupported schema version without running a handler', async () => {
      const { service, raffleProcessor, dlq } = makeService();

      const result = await service.dispatch(
        {
          type: 'RaffleCancelled',
          schemaVersion: 99,
          raffle_id: 1,
          reason: 'expired',
        },
        raw,
      );

      expect(result.outcome).toBe('failed');
      // The handler/processor must NOT run for an unsupported version.
      expect(raffleProcessor.handleRaffleCancelled).not.toHaveBeenCalled();

      const records = dlq.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        eventType: 'RaffleCancelled',
        schemaVersion: 99,
        reason: 'SCHEMA_UNSUPPORTED',
      });
      expect(records[0].errorMessage).toContain('Unsupported schema version');
    });

    it('records schema version and HANDLER_ERROR reason on handler failure', async () => {
      const { service, ticketProcessor, dlq } = makeService();
      ticketProcessor.handleTicketPurchased.mockRejectedValueOnce(
        new Error('write failed'),
      );

      const result = await service.dispatch(
        {
          type: 'TicketPurchased',
          schemaVersion: 1,
          raffle_id: 1,
          buyer: 'GBUYER',
          ticket_ids: [1],
          total_paid: '100',
        },
        raw,
      );

      expect(result.outcome).toBe('failed');
      const records = dlq.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        eventType: 'TicketPurchased',
        schemaVersion: 1,
        reason: 'HANDLER_ERROR',
      });
    });
  });
});

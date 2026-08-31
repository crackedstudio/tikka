import { IngestionDispatcherService } from '../../ingestor/ingestion-dispatcher.service';
import { DeadLetterQueueService } from '../../ingestor/dead-letter-queue.service';
import {
  makeRaffleCancelledEvent,
  makeRawIngestionEvent,
  makeTicketPurchasedEvent,
} from './helpers/mock-events';

describe('Ingestion dispatcher isolation', () => {
  it('sends only failed events to the DLQ and continues dispatching later events', async () => {
    // Single attempt so a failing handler is reported 'failed' and enqueued to
    // the DLQ exactly once (the dispatcher otherwise retries up to the default
    // MAX_DISPATCH_RETRIES=3 with backoff).
    const previousMaxRetries = process.env.MAX_DISPATCH_RETRIES;
    process.env.MAX_DISPATCH_RETRIES = '1';
    try {
    const raffleProcessor = {
      handleRaffleCreated: jest.fn(),
      handleRaffleFinalized: jest.fn(),
      handleRaffleCancelled: jest.fn().mockResolvedValue(undefined),
    };
    const ticketProcessor = {
      handleTicketPurchased: jest
        .fn()
        // The dispatcher retries up to MAX_DISPATCH_RETRIES (default 3) times
        // with backoff. Reject on every attempt so the event is finally sent
        // to the DLQ and reported as 'failed'.
        .mockRejectedValue(new Error('insert failed')),
      handleTicketRefunded: jest.fn(),
    };
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
    const dlq = new DeadLetterQueueService();
    const dispatcher = new IngestionDispatcherService(
      dataSource as any,
      raffleProcessor as any,
      ticketProcessor as any,
      {} as any,
      dlq,
    );

    const failedRaw = makeRawIngestionEvent('TicketPurchased', {
      id: 'tx-failed',
      ledger: 500,
      decodedPayload: { ticket_ids: [1, 2] },
    });
    const successfulRaw = makeRawIngestionEvent('RaffleCancelled', {
      id: 'tx-success',
      ledger: 501,
      decodedPayload: { reason: 'expired' },
    });

    const results = await dispatcher.dispatchMany([
      { event: makeTicketPurchasedEvent({ ticket_ids: [1, 2] }), rawEvent: failedRaw as any },
      { event: makeRaffleCancelledEvent({ reason: 'expired' }), rawEvent: successfulRaw as any },
    ]);

    expect(results.map((result) => result.outcome)).toEqual([
      'failed',
      'succeeded',
    ]);
    expect(ticketProcessor.handleTicketPurchased).toHaveBeenCalledTimes(1);
    expect(raffleProcessor.handleRaffleCancelled).toHaveBeenCalledTimes(1);
    expect(dlq.getRecords()).toHaveLength(1);
    expect(dlq.getRecords()[0]).toMatchObject({
      eventId: 'tx-failed',
      eventType: 'TicketPurchased',
      ledger: 500,
      rawEvent: failedRaw,
    });
    } finally {
      if (previousMaxRetries === undefined) {
        delete process.env.MAX_DISPATCH_RETRIES;
      } else {
        process.env.MAX_DISPATCH_RETRIES = previousMaxRetries;
      }
    }
  });
});

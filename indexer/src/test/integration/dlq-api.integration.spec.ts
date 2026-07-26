import { DataSource, Repository } from 'typeorm';
import { DlqService } from '../../ingestor/dlq.service';
import { DeadLetterEventEntity, DlqReason } from '../../database/entities/dead-letter-event.entity';
import { IngestionDispatcherService } from '../../ingestor/ingestion-dispatcher.service';
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';

describe('DLQ Service Integration', () => {
  let ctx: DbContainerContext;
  let ds: DataSource;
  let dlqRepo: Repository<DeadLetterEventEntity>;
  let dlqService: DlqService;
  let dispatcherService: IngestionDispatcherService;

  beforeAll(async () => {
    ctx = await startDb();
    ds = ctx.dataSource;
    dlqRepo = ds.getRepository(DeadLetterEventEntity);

    // Mock dispatcher service
    dispatcherService = {
      dispatch: jest.fn().mockResolvedValue({ outcome: 'success' }),
    } as any;

    dlqService = new DlqService(dlqRepo, dispatcherService, undefined);
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => {
    await stopDb(ctx);
  });

  beforeEach(async () => {
    await ds.query(`SET session_replication_role = 'replica'`);
    await ds.query(`TRUNCATE TABLE dead_letter_events RESTART IDENTITY CASCADE`);
    await ds.query(`SET session_replication_role = 'DEFAULT'`);
  });

  describe('Replay DLQ entries', () => {
    it('should replay all 5 seeded DLQ entries', async () => {
      // Seed 5 DLQ entries
      for (let i = 0; i < 5; i++) {
        await dlqRepo.save(
          dlqRepo.create({
            ledger: 1000 + i,
            contractId: 'CONTRACT123',
            eventType: 'raffle_created',
            rawPayload: { ledger: 1000 + i, type: 'raffle_created' },
            errorMessage: 'Test error',
            reason: DlqReason.HANDLER_ERROR,
            retryable: true,
            retryCount: 0,
          }),
        );
      }

      // Verify count before replay
      const countBefore = await dlqService.count();
      expect(countBefore).toBe(5);

      // Replay all entries
      const result = await dlqService.replayAll();

      // Verify replay results
      expect(result.replayed).toBe(5);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);

      // Verify entries were marked as replayed
      const entries = await dlqRepo.find();
      const replayed = entries.filter((e) => e.replayedAt !== null);
      expect(replayed.length).toBe(5);

      // Verify dispatcher was called for each entry
      expect(dispatcherService.dispatch).toHaveBeenCalledTimes(5);
    });

    it('should replay only entries in specified ledger range', async () => {
      // Seed 5 DLQ entries across different ledgers
      for (let i = 0; i < 5; i++) {
        await dlqRepo.save(
          dlqRepo.create({
            ledger: 2000 + i * 10, // 2000, 2010, 2020, 2030, 2040
            contractId: 'CONTRACT456',
            eventType: 'ticket_purchased',
            rawPayload: { ledger: 2000 + i * 10, type: 'ticket_purchased' },
            errorMessage: 'Test error',
            reason: DlqReason.HANDLER_ERROR,
            retryable: true,
            retryCount: 0,
          }),
        );
      }

      // Replay only entries between ledger 2010 and 2030
      const result = await dlqService.replayAll({
        fromLedger: 2010,
        toLedger: 2030,
      });

      // Should replay entries at ledgers 2010, 2020, 2030 (3 entries)
      expect(result.replayed).toBe(3);

      // Verify only specified ledgers were replayed
      const entries = await dlqRepo.find({ order: { ledger: 'ASC' } });
      expect(entries[0].replayedAt).toBeNull(); // ledger 2000
      expect(entries[1].replayedAt).not.toBeNull(); // ledger 2010
      expect(entries[2].replayedAt).not.toBeNull(); // ledger 2020
      expect(entries[3].replayedAt).not.toBeNull(); // ledger 2030
      expect(entries[4].replayedAt).toBeNull(); // ledger 2040
    });

    it('should skip non-retryable entries', async () => {
      // Seed mix of retryable and non-retryable entries
      await dlqRepo.save(
        dlqRepo.create({
          ledger: 3000,
          contractId: 'CONTRACT789',
          eventType: 'event1',
          rawPayload: { ledger: 3000, type: 'event1' },
          errorMessage: 'Parse error',
          reason: DlqReason.PARSE_ERROR,
          retryable: false, // Not retryable
          retryCount: 0,
        }),
      );

      await dlqRepo.save(
        dlqRepo.create({
          ledger: 3001,
          contractId: 'CONTRACT789',
          eventType: 'event2',
          rawPayload: { ledger: 3001, type: 'event2' },
          errorMessage: 'Handler error',
          reason: DlqReason.HANDLER_ERROR,
          retryable: true, // Retryable
          retryCount: 0,
        }),
      );

      // Replay all
      const result = await dlqService.replayAll();

      // Only the retryable entry should be replayed
      expect(result.replayed).toBe(1);

      // Verify first entry was not replayed
      const entries = await dlqRepo.find({ order: { ledger: 'ASC' } });
      expect(entries[0].replayedAt).toBeNull();
      expect(entries[1].replayedAt).not.toBeNull();
    });

    it('should handle failed replays and increment retry count', async () => {
      // Mock dispatcher to fail
      (dispatcherService.dispatch as jest.Mock).mockResolvedValue({
        outcome: 'failed',
        error: new Error('Replay failed'),
      });

      // Seed entry
      await dlqRepo.save(
        dlqRepo.create({
          ledger: 4000,
          contractId: 'CONTRACT999',
          eventType: 'event_fail',
          rawPayload: { ledger: 4000, type: 'event_fail' },
          errorMessage: 'Original error',
          reason: DlqReason.HANDLER_ERROR,
          retryable: true,
          retryCount: 0,
        }),
      );

      // Replay
      const result = await dlqService.replayAll();

      // Should report 1 failed
      expect(result.failed).toBe(1);
      expect(result.replayed).toBe(0);

      // Verify retry count was incremented
      const entry = await dlqRepo.findOne({ where: { ledger: 4000 } });
      expect(entry!.retryCount).toBe(1);
      expect(entry!.replayedAt).toBeNull();
    });

    it('should respect dry-run mode without making changes', async () => {
      // Seed entries
      for (let i = 0; i < 3; i++) {
        await dlqRepo.save(
          dlqRepo.create({
            ledger: 5000 + i,
            contractId: 'CONTRACT_DRY',
            eventType: 'dry_event',
            rawPayload: { ledger: 5000 + i, type: 'dry_event' },
            errorMessage: 'Test error',
            reason: DlqReason.HANDLER_ERROR,
            retryable: true,
            retryCount: 0,
          }),
        );
      }

      // Dry run
      const result = await dlqService.replayAll({ dryRun: true });

      // Should report skipped
      expect(result.dryRun).toBe(true);
      expect(result.skipped).toBe(3);
      expect(result.replayed).toBe(0);

      // Verify no entries were modified
      const entries = await dlqRepo.find();
      entries.forEach((e) => {
        expect(e.replayedAt).toBeNull();
        expect(e.retryCount).toBe(0);
      });

      // Dispatcher should not be called
      expect(dispatcherService.dispatch).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqService, MAX_RETRIES } from './dlq.service';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import { IngestionDispatcherService } from './ingestion-dispatcher.service';
import { DomainEvent } from './event.types';

describe('DlqService', () => {
  let service: DlqService;
  let repo: jest.Mocked<Repository<DeadLetterEventEntity>>;
  let dispatcher: jest.Mocked<IngestionDispatcherService>;

  beforeEach(async () => {
    repo = {
      save: jest.fn(),
      create: jest.fn((e) => e as DeadLetterEventEntity),
      count: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    } as any;

    dispatcher = {
      dispatch: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: getRepositoryToken(DeadLetterEventEntity), useValue: repo },
        { provide: IngestionDispatcherService, useValue: dispatcher },
      ],
    }).compile();

    service = module.get<DlqService>(DlqService);
  });

  describe('insert', () => {
    it('should save a failed event to the DLQ', async () => {
      const event: DomainEvent = { type: 'RaffleCreated', raffle_id: 1, creator: 'GABC', params: {} as any };
      const rawEvent = { ledger: 1000, contractId: 'CXYZ' };
      const error = new Error('DB constraint violation');

      await service.insert(event, rawEvent, error);

      expect(repo.create).toHaveBeenCalledWith({
        ledger: 1000,
        contractId: 'CXYZ',
        eventType: 'RaffleCreated',
        rawPayload: rawEvent,
        errorMessage: 'DB constraint violation',
        retryCount: 0,
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('should handle non-Error objects', async () => {
      const event: DomainEvent = { type: 'TicketPurchased', raffle_id: 2, buyer: 'GDEF', ticket_ids: [], total_paid: '0' };
      const rawEvent = { ledger: 2000 };

      await service.insert(event, rawEvent, 'string error');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ errorMessage: 'string error' }),
      );
    });
  });

  describe('count', () => {
    it('should return the DLQ size', async () => {
      repo.count.mockResolvedValue(42);
      expect(await service.count()).toBe(42);
    });
  });

  describe('replayAll', () => {
    it('should replay eligible entries and delete on success', async () => {
      const entry = {
        id: 'uuid-1',
        eventType: 'RaffleCreated',
        rawPayload: { ledger: 1000 },
        retryCount: 0,
      } as unknown as DeadLetterEventEntity;

      repo.find.mockResolvedValue([entry]);
      const mockQr = { commitTransaction: jest.fn(), release: jest.fn() };
      dispatcher.dispatch.mockResolvedValue(mockQr as any);

      const result = await service.replayAll();

      expect(result.replayed).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockQr.commitTransaction).toHaveBeenCalled();
      expect(repo.delete).toHaveBeenCalledWith('uuid-1');
    });

    it('should increment retryCount on failure', async () => {
      const entry = {
        id: 'uuid-2',
        eventType: 'TicketPurchased',
        rawPayload: { ledger: 2000 },
        retryCount: 1,
        errorMessage: 'old error',
      } as unknown as DeadLetterEventEntity;

      repo.find.mockResolvedValue([entry]);
      dispatcher.dispatch.mockRejectedValue(new Error('still failing'));

      const result = await service.replayAll();

      expect(result.replayed).toBe(0);
      expect(result.failed).toBe(1);
      expect(entry.retryCount).toBe(2);
      expect(entry.errorMessage).toBe('still failing');
      expect(repo.save).toHaveBeenCalledWith(entry);
    });

    it('should skip entries that have exceeded MAX_RETRIES', async () => {
      const exhausted = {
        id: 'uuid-3',
        eventType: 'RaffleFinalized',
        rawPayload: { ledger: 3000 },
        retryCount: MAX_RETRIES,
      } as unknown as DeadLetterEventEntity;

      repo.find.mockResolvedValue([exhausted]);

      const result = await service.replayAll();

      expect(result.replayed).toBe(0);
      expect(result.failed).toBe(0);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('should handle null QueryRunner from dispatcher', async () => {
      const entry = {
        id: 'uuid-4',
        eventType: 'DrawTriggered',
        rawPayload: { ledger: 4000 },
        retryCount: 0,
      } as unknown as DeadLetterEventEntity;

      repo.find.mockResolvedValue([entry]);
      dispatcher.dispatch.mockResolvedValue(null);

      const result = await service.replayAll();

      expect(result.replayed).toBe(1);
      expect(repo.delete).toHaveBeenCalledWith('uuid-4');
    });
  });
});

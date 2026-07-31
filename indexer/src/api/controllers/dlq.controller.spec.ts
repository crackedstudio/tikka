import { DlqController } from './dlq.controller';
import { DlqService } from '../../ingestor/dlq.service';
import { Repository } from 'typeorm';
import { DeadLetterEventEntity, DlqReason } from '../../database/entities/dead-letter-event.entity';

describe('DlqController', () => {
  let controller: DlqController;
  let dlqService: any;
  let dlqRepo: any;

  beforeEach(() => {
    dlqService = {
      replayAll: jest.fn(),
      count: jest.fn(),
    };

    dlqRepo = {
      find: jest.fn(),
    };

    controller = new DlqController(dlqService, dlqRepo);
  });

  describe('replay', () => {
    it('should trigger replay for all entries when no IDs provided', async () => {
      dlqService.replayAll.mockResolvedValue({
        replayed: 5,
        failed: 0,
        skipped: 0,
        dryRun: false,
      });

      const result = await controller.replay({});

      expect(result).toMatchObject({
        jobId: expect.any(String),
        message: expect.stringContaining('all eligible DLQ entries'),
      });
      expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should trigger replay for specific IDs when provided', async () => {
      const ids = ['id1', 'id2', 'id3'];

      const result = await controller.replay({ ids });

      expect(result).toMatchObject({
        jobId: expect.any(String),
        message: expect.stringContaining('3 specific entries'),
      });
      expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('status', () => {
    it('should return current DLQ depth and null replay status initially', async () => {
      dlqService.count.mockResolvedValue(10);

      const result = await controller.status();

      expect(result).toEqual({
        depth: 10,
        lastReplayAt: null,
        lastReplayCount: 0,
      });
    });

    it('should return last replay information after a replay', async () => {
      dlqService.count.mockResolvedValue(5);

      // Simulate a replay
      dlqService.replayAll.mockResolvedValue({
        replayed: 3,
        failed: 0,
        skipped: 2,
        dryRun: false,
      });

      await controller.replay({});
      
      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = await controller.status();

      expect(result.depth).toBe(5);
      expect(result.lastReplayAt).not.toBeNull();
      expect(result.lastReplayCount).toBe(3);
    });
  });
});

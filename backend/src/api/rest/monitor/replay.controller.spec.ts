import { ReplayController } from './replay.controller';
import { ReplayService, ReplayJobConfig } from '../../../services/replay.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ReplayController', () => {
  let controller: ReplayController;
  let mockReplayService: {
    startReplay: jest.Mock;
    getJobStatus: jest.Mock;
  };

  beforeEach(() => {
    mockReplayService = {
      startReplay: jest.fn(),
      getJobStatus: jest.fn(),
    };

    controller = new ReplayController(mockReplayService as unknown as ReplayService);
  });

  it('starts a dry-run replay successfully', async () => {
    const config: ReplayJobConfig = {
      fromLedger: 10,
      toLedger: 20,
      dryRun: true,
    };
    mockReplayService.startReplay.mockReturnValue('job-uuid-123');

    const result = await controller.startReplay(config);

    expect(mockReplayService.startReplay).toHaveBeenCalledWith(config);
    expect(result).toEqual({
      jobId: 'job-uuid-123',
      message: 'Replay job started. Poll /admin/replay/job-uuid-123 for progress.',
    });
  });

  it('starts a confirmed mutating replay successfully', async () => {
    const config: ReplayJobConfig = {
      fromLedger: 10,
      toLedger: 20,
      dryRun: false,
      confirmed: true,
    };
    mockReplayService.startReplay.mockReturnValue('job-uuid-confirmed');

    const result = await controller.startReplay(config);

    expect(mockReplayService.startReplay).toHaveBeenCalledWith(config);
    expect(result.jobId).toBe('job-uuid-confirmed');
  });

  it('converts validation error to BadRequestException', async () => {
    const config: ReplayJobConfig = {
      fromLedger: 20,
      toLedger: 10,
      dryRun: true,
    };
    mockReplayService.startReplay.mockImplementation(() => {
      throw new Error('fromLedger (20) must be <= toLedger (10)');
    });

    await expect(controller.startReplay(config)).rejects.toThrow(BadRequestException);
    await expect(controller.startReplay(config)).rejects.toThrow(
      'fromLedger (20) must be <= toLedger (10)',
    );
  });

  it('converts confirmation missing error to BadRequestException', async () => {
    const config: ReplayJobConfig = {
      fromLedger: 10,
      toLedger: 20,
      dryRun: false,
    };
    mockReplayService.startReplay.mockImplementation(() => {
      throw new Error(
        "Mutating replay operations require explicit confirmation. Please set 'confirmed' to true.",
      );
    });

    await expect(controller.startReplay(config)).rejects.toThrow(BadRequestException);
    await expect(controller.startReplay(config)).rejects.toThrow(
      "Mutating replay operations require explicit confirmation. Please set 'confirmed' to true.",
    );
  });

  it('gets status of a job successfully', () => {
    const jobStatus = {
      jobId: 'job-uuid-123',
      status: 'running' as const,
      config: { fromLedger: 10, toLedger: 20, dryRun: true },
      progress: { processedCount: 5, skippedCount: 0, totalLedgers: 11 },
      createdAt: new Date().toISOString(),
    };
    mockReplayService.getJobStatus.mockReturnValue(jobStatus);

    const result = controller.getJobStatus('job-uuid-123');

    expect(mockReplayService.getJobStatus).toHaveBeenCalledWith('job-uuid-123');
    expect(result).toEqual(jobStatus);
  });

  it('throws NotFoundException if job is not found', () => {
    mockReplayService.getJobStatus.mockReturnValue(null);

    expect(() => controller.getJobStatus('non-existent')).toThrow(NotFoundException);
  });
});

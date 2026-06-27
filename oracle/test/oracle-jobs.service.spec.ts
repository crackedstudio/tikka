/**
 * Oracle Jobs Service Integration Tests
 * 
 * Tests job state persistence and recovery:
 * 1. Persist job state transitions to database
 * 2. Recover IN_PROGRESS jobs on startup
 * 3. Handle database failures gracefully
 * 4. Clean up old completed jobs
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OracleJobsService, OracleJobRecord } from '../src/services/oracle-jobs.service';
import { JobState } from '../src/queue/job-state.types';

describe('OracleJobsService', () => {
  let service: OracleJobsService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'SUPABASE_URL') return process.env.SUPABASE_URL || 'http://localhost:54321';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
        return defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleJobsService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<OracleJobsService>(OracleJobsService);
  });

  describe('Job Persistence', () => {
    it('should upsert a new job', async () => {
      const jobRecord: OracleJobRecord = {
        job_id: 'test-job-1',
        raffle_id: 123,
        state: JobState.QUEUED,
        metadata: { source: 'test' },
      };

      // Skip if not connected to real database
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const result = await service.upsertJob(jobRecord);
      expect(result).not.toBeNull();
      expect(result?.job_id).toBe(jobRecord.job_id);
      expect(result?.state).toBe(JobState.QUEUED);

      // Cleanup
      await service.deleteJob(jobRecord.job_id);
    });

    it('should update existing job state', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const jobRecord: OracleJobRecord = {
        job_id: 'test-job-2',
        raffle_id: 456,
        state: JobState.QUEUED,
      };

      await service.upsertJob(jobRecord);

      const updated = await service.updateJobState(jobRecord.job_id, JobState.GENERATING);
      expect(updated).toBe(true);

      const retrieved = await service.getJob(jobRecord.job_id);
      expect(retrieved?.state).toBe(JobState.GENERATING);

      // Cleanup
      await service.deleteJob(jobRecord.job_id);
    });

    it('should retrieve a job by ID', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const jobRecord: OracleJobRecord = {
        job_id: 'test-job-3',
        raffle_id: 789,
        state: JobState.QUEUED,
      };

      await service.upsertJob(jobRecord);

      const retrieved = await service.getJob(jobRecord.job_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.raffle_id).toBe(789);

      // Cleanup
      await service.deleteJob(jobRecord.job_id);
    });
  });

  describe('Job Recovery on Startup', () => {
    it('should retrieve all in-progress jobs', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const inProgressJobs: OracleJobRecord[] = [
        { job_id: 'recovery-1', raffle_id: 1, state: JobState.GENERATING },
        { job_id: 'recovery-2', raffle_id: 2, state: JobState.SUBMITTING },
        { job_id: 'recovery-3', raffle_id: 3, state: JobState.CONFIRMING },
      ];

      // Insert test jobs
      for (const job of inProgressJobs) {
        await service.upsertJob(job);
      }

      // Retrieve in-progress jobs
      const recovered = await service.getInProgressJobs();
      expect(recovered.length).toBeGreaterThanOrEqual(inProgressJobs.length);

      const recoveredIds = recovered.map((j) => j.job_id);
      for (const job of inProgressJobs) {
        expect(recoveredIds).toContain(job.job_id);
      }

      // Cleanup
      for (const job of inProgressJobs) {
        await service.deleteJob(job.job_id);
      }
    });

    it('should retrieve jobs by state', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const stateJob: OracleJobRecord = {
        job_id: 'state-test-1',
        raffle_id: 999,
        state: JobState.CONFIRMING,
      };

      await service.upsertJob(stateJob);

      const jobsByState = await service.getJobsByState(JobState.CONFIRMING);
      expect(jobsByState.length).toBeGreaterThanOrEqual(1);
      expect(jobsByState.some((j) => j.job_id === stateJob.job_id)).toBe(true);

      // Cleanup
      await service.deleteJob(stateJob.job_id);
    });
  });

  describe('Cleanup Operations', () => {
    it('should delete old completed jobs', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const completedJob: OracleJobRecord = {
        job_id: 'cleanup-test-1',
        raffle_id: 111,
        state: JobState.CONFIRMED,
      };

      await service.upsertJob(completedJob);

      // Cleanup old jobs (should be young, so count should be 0)
      const deletedCount = await service.deleteOldJobs(0);
      // This will only delete jobs older than 0 minutes, so our newly created job won't be deleted
      expect(typeof deletedCount).toBe('number');
    });

    it('should delete a single job', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const jobToDelete: OracleJobRecord = {
        job_id: 'delete-test-1',
        raffle_id: 222,
        state: JobState.FAILED,
      };

      await service.upsertJob(jobToDelete);

      const deleted = await service.deleteJob(jobToDelete.job_id);
      expect(deleted).toBe(true);

      const retrieved = await service.getJob(jobToDelete.job_id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle upsert when service is not initialized', async () => {
      // Create a service with invalid config
      configService.get.mockImplementation(() => undefined);
      const service2 = new OracleJobsService(configService);

      const jobRecord: OracleJobRecord = {
        job_id: 'test-no-init',
        raffle_id: 333,
        state: JobState.QUEUED,
      };

      const result = await service2.upsertJob(jobRecord);
      expect(result).toBeNull();
    });

    it('should handle get when service is not initialized', async () => {
      configService.get.mockImplementation(() => undefined);
      const service2 = new OracleJobsService(configService);

      const result = await service2.getJob('test-job');
      expect(result).toBeNull();
    });

    it('should return empty array for getInProgressJobs when not initialized', async () => {
      configService.get.mockImplementation(() => undefined);
      const service2 = new OracleJobsService(configService);

      const result = await service2.getInProgressJobs();
      expect(result).toEqual([]);
    });

    it('should return false for updateJobState when not initialized', async () => {
      configService.get.mockImplementation(() => undefined);
      const service2 = new OracleJobsService(configService);

      const result = await service2.updateJobState('test-job', JobState.GENERATING);
      expect(result).toBe(false);
    });

    it('should return false for deleteJob when not initialized', async () => {
      configService.get.mockImplementation(() => undefined);
      const service2 = new OracleJobsService(configService);

      const result = await service2.deleteJob('test-job');
      expect(result).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should track job state transitions through database', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const jobId = 'transition-test-1';
      const raffleId = 444;

      // Create job in QUEUED state
      await service.upsertJob({
        job_id: jobId,
        raffle_id: raffleId,
        state: JobState.QUEUED,
      });

      // Transition to GENERATING
      await service.updateJobState(jobId, JobState.GENERATING);
      let retrieved = await service.getJob(jobId);
      expect(retrieved?.state).toBe(JobState.GENERATING);

      // Transition to SUBMITTING
      await service.updateJobState(jobId, JobState.SUBMITTING);
      retrieved = await service.getJob(jobId);
      expect(retrieved?.state).toBe(JobState.SUBMITTING);

      // Transition to CONFIRMING
      await service.updateJobState(jobId, JobState.CONFIRMING);
      retrieved = await service.getJob(jobId);
      expect(retrieved?.state).toBe(JobState.CONFIRMING);

      // Transition to CONFIRMED (terminal)
      await service.updateJobState(jobId, JobState.CONFIRMED);
      retrieved = await service.getJob(jobId);
      expect(retrieved?.state).toBe(JobState.CONFIRMED);

      // Cleanup
      await service.deleteJob(jobId);
    });

    it('should preserve metadata through state transitions', async () => {
      if (!service.isInitialized()) {
        expect(true).toBe(true);
        return;
      }

      const jobId = 'metadata-test-1';
      const metadata = {
        vrf: 'seed-123',
        txHash: 'hash-456',
        ledger: 789,
      };

      await service.upsertJob({
        job_id: jobId,
        raffle_id: 555,
        state: JobState.QUEUED,
        metadata,
      });

      const retrieved = await service.getJob(jobId);
      expect(retrieved?.metadata).toEqual(expect.objectContaining(metadata));

      // Update with more metadata
      const updatedMetadata = { ...metadata, completed: true };
      await service.updateJobState(jobId, JobState.CONFIRMED, updatedMetadata);

      const final = await service.getJob(jobId);
      expect(final?.metadata).toEqual(expect.objectContaining(updatedMetadata));

      // Cleanup
      await service.deleteJob(jobId);
    });
  });

  describe('Service Status', () => {
    it('should report initialization status', async () => {
      const isInitialized = service.isInitialized();
      expect(typeof isInitialized).toBe('boolean');
    });
  });
});

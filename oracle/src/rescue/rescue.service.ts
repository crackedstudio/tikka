import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from '../queue/randomness.queue';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService, SubmitResult } from '../submitter/tx-submitter.service';
import { RandomnessMethod, RandomnessResult } from '../queue/queue.types';

export interface RescueLogEntry {
  timestamp: Date;
  action: 'RE_ENQUEUE' | 'FORCE_SUBMIT' | 'FORCE_FAIL';
  raffleId: number;
  requestId: string;
  jobId?: string;
  operator: string;
  reason: string;
  result: 'SUCCESS' | 'FAILURE';
  details?: any;
}

export interface JobInfo {
  id: string;
  raffleId: number;
  requestId: string;
  attempts: number;
  failedReason?: string;
  state: string;
  timestamp: number;
}

@Injectable()
export class RescueService {
  private readonly logger = new Logger(RescueService.name);
  private readonly rescueLogs: RescueLogEntry[] = [];
  private readonly HIGH_STAKES_THRESHOLD_XLM = 500;

  constructor(
    @InjectQueue(RANDOMNESS_QUEUE) private readonly randomnessQueue: Queue,
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
  ) {}

  /**
   * Re-enqueue a failed job back into the queue
   */
  async reEnqueueJob(
    jobId: string,
    operator: string,
    reason: string,
  ): Promise<{ success: boolean; message: string; newJobId?: string }> {
    try {
      const job = await this.randomnessQueue.getJob(jobId);
      
      if (!job) {
        return { success: false, message: `Job ${jobId} not found` };
      }

      const payload = job.data as RandomnessJobPayload;
      
      // Check if already processed
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(payload.raffleId);
      if (alreadySubmitted) {
        return {
          success: false,
          message: `Raffle ${payload.raffleId} already finalized, cannot re-enqueue`,
        };
      }

      // Add new job to queue
      const newJob = await this.randomnessQueue.add(payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      // Log the rescue operation
      this.logRescue({
        timestamp: new Date(),
        action: 'RE_ENQUEUE',
        raffleId: payload.raffleId,
        requestId: payload.requestId,
        jobId: newJob.id?.toString(),
        operator,
        reason,
        result: 'SUCCESS',
        details: { originalJobId: jobId, newJobId: newJob.id },
      });

      this.logger.log(
        `Re-enqueued job ${jobId} as ${newJob.id} for raffle ${payload.raffleId} by ${operator}`,
      );

      return {
        success: true,
        message: `Job re-enqueued successfully`,
        newJobId: newJob.id?.toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to re-enqueue job ${jobId}: ${error.message}`, error.stack);
      
      this.logRescue({
        timestamp: new Date(),
        action: 'RE_ENQUEUE',
        raffleId: 0,
        requestId: '',
        jobId,
        operator,
        reason,
        result: 'FAILURE',
        details: { error: error.message },
      });

      return { success: false, message: `Failed to re-enqueue: ${error.message}` };
    }
  }

  /**
   * Force submit randomness for a specific raffle
   */
  async forceSubmit(
    raffleId: number,
    requestId: string,
    operator: string,
    reason: string,
    prizeAmount?: number,
  ): Promise<{ success: boolean; message: string; txHash?: string }> {
    try {
      // Check if already submitted
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        return {
          success: false,
          message: `Raffle ${raffleId} already finalized`,
        };
      }

      // Get prize amount if not provided
      let finalPrizeAmount = prizeAmount;
      if (finalPrizeAmount === undefined) {
        const raffleData = await this.contractService.getRaffleData(raffleId);
        finalPrizeAmount = raffleData.prizeAmount;
      }

      // Determine method and compute randomness
      const method = this.determineMethod(finalPrizeAmount);
      this.logger.log(
        `Force submitting for raffle ${raffleId}: prize=${finalPrizeAmount} XLM, method=${method}`,
      );

      const randomness = await this.computeRandomness(method, requestId);
      
      // Submit to contract
      const result = await this.txSubmitter.submitRandomness(raffleId, randomness);

      if (!result.success) {
        throw new Error(`Transaction submission failed`);
      }

      // Log the rescue operation
      this.logRescue({
        timestamp: new Date(),
        action: 'FORCE_SUBMIT',
        raffleId,
        requestId,
        operator,
        reason,
        result: 'SUCCESS',
        details: {
          txHash: result.txHash,
          ledger: result.ledger,
          method,
          prizeAmount: finalPrizeAmount,
        },
      });

      this.logger.log(
        `Force submitted randomness for raffle ${raffleId}: tx=${result.txHash} by ${operator}`,
      );

      return {
        success: true,
        message: `Randomness submitted successfully`,
        txHash: result.txHash,
      };
    } catch (error) {
      this.logger.error(
        `Failed to force submit for raffle ${raffleId}: ${error.message}`,
        error.stack,
      );

      this.logRescue({
        timestamp: new Date(),
        action: 'FORCE_SUBMIT',
        raffleId,
        requestId,
        operator,
        reason,
        result: 'FAILURE',
        details: { error: error.message },
      });

      return { success: false, message: `Failed to submit: ${error.message}` };
    }
  }

  /**
   * Force fail a job (mark as invalid/malicious)
   */
  async forceFail(
    jobId: string,
    operator: string,
    reason: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const job = await this.randomnessQueue.getJob(jobId);
      
      if (!job) {
        return { success: false, message: `Job ${jobId} not found` };
      }

      const payload = job.data as RandomnessJobPayload;

      // Remove job from queue
      await job.remove();

      // Log the rescue operation
      this.logRescue({
        timestamp: new Date(),
        action: 'FORCE_FAIL',
        raffleId: payload.raffleId,
        requestId: payload.requestId,
        jobId,
        operator,
        reason,
        result: 'SUCCESS',
        details: { payload },
      });

      this.logger.warn(
        `Force failed job ${jobId} for raffle ${payload.raffleId} by ${operator}: ${reason}`,
      );

      return {
        success: true,
        message: `Job marked as failed and removed from queue`,
      };
    } catch (error) {
      this.logger.error(`Failed to force fail job ${jobId}: ${error.message}`, error.stack);

      this.logRescue({
        timestamp: new Date(),
        action: 'FORCE_FAIL',
        raffleId: 0,
        requestId: '',
        jobId,
        operator,
        reason,
        result: 'FAILURE',
        details: { error: error.message },
      });

      return { success: false, message: `Failed to force fail: ${error.message}` };
    }
  }

  /**
   * Get failed jobs from the queue
   */
  async getFailedJobs(): Promise<JobInfo[]> {
    const failed = await this.randomnessQueue.getFailed();
    return Promise.all(failed.map((job) => this.mapJobToInfo(job)));
  }

  /**
   * Get all jobs in various states
   */
  async getAllJobs(): Promise<{
    waiting: JobInfo[];
    active: JobInfo[];
    completed: JobInfo[];
    failed: JobInfo[];
    delayed: JobInfo[];
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.randomnessQueue.getWaiting(),
      this.randomnessQueue.getActive(),
      this.randomnessQueue.getCompleted(),
      this.randomnessQueue.getFailed(),
      this.randomnessQueue.getDelayed(),
    ]);

    return {
      waiting: await Promise.all(waiting.map((j) => this.mapJobToInfo(j))),
      active: await Promise.all(active.map((j) => this.mapJobToInfo(j))),
      completed: await Promise.all(completed.map((j) => this.mapJobToInfo(j))),
      failed: await Promise.all(failed.map((j) => this.mapJobToInfo(j))),
      delayed: await Promise.all(delayed.map((j) => this.mapJobToInfo(j))),
    };
  }

  /**
   * Get rescue audit logs
   */
  getRescueLogs(limit = 100): RescueLogEntry[] {
    return this.rescueLogs.slice(-limit);
  }

  /**
   * Get rescue logs for a specific raffle
   */
  getRescueLogsByRaffle(raffleId: number): RescueLogEntry[] {
    return this.rescueLogs.filter((log) => log.raffleId === raffleId);
  }

  private async mapJobToInfo(job: Job): Promise<JobInfo> {
    const data = job.data as RandomnessJobPayload;
    return {
      id: job.id?.toString() || '',
      raffleId: data.raffleId,
      requestId: data.requestId,
      attempts: job.attemptsMade || 0,
      failedReason: job.failedReason,
      state: await job.getState(),
      timestamp: job.timestamp,
    };
  }

  private logRescue(entry: RescueLogEntry): void {
    this.rescueLogs.push(entry);
    
    // Keep only last 1000 entries in memory
    if (this.rescueLogs.length > 1000) {
      this.rescueLogs.shift();
    }
  }

  private determineMethod(prizeAmount: number): RandomnessMethod {
    return prizeAmount >= this.HIGH_STAKES_THRESHOLD_XLM
      ? RandomnessMethod.VRF
      : RandomnessMethod.PRNG;
  }

  private async computeRandomness(
    method: RandomnessMethod,
    requestId: string,
  ): Promise<RandomnessResult> {
    if (method === RandomnessMethod.VRF) {
      return await this.vrfService.compute(requestId);
    } else {
      return await this.prngService.compute(requestId);
    }
  }
}

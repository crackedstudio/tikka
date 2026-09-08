import { OracleLoggerService, OracleLogFields } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from '../queue/randomness.queue';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { RandomnessMethod, RandomnessResult } from '../queue/queue.types';
import { LagMonitorService } from '../health/lag-monitor.service';
import { HealthService } from '../health/health.service';
import {
  DrawRequestStatus,
  StuckDrawLedgerRange,
  StuckDrawReport,
  StuckDrawReportEntry,
  StuckDrawReportSummary,
} from './stuck-draw.types';

export {
  DrawRequestStatus,
  StuckDrawLedgerRange,
  StuckDrawReport,
  StuckDrawReportEntry,
  StuckDrawReportSummary,
} from './stuck-draw.types';

interface DrawCandidate {
  raffleId: number;
  requestId: string;
  jobId?: string;
  queueState?: string;
  failedReason?: string;
  jobTimestamp?: number;
  requestedAtLedger?: number;
  trackedAt?: Date;
  attempts?: number;
}

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
export class RescuePlannerService {
  private readonly HIGH_STAKES_THRESHOLD_XLM = 500;

  constructor(
    @InjectQueue(RANDOMNESS_QUEUE) private readonly randomnessQueue: Queue,
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
  ) {}
async getForceSubmitPreview(
    raffleId: number,
    requestId: string,
    prizeAmount?: number,
  ): Promise<{
    success: boolean;
    message: string;
    preview?: {
      raffleId: number;
      requestId: string;
      prizeAmount: number;
      method: RandomnessMethod;
      network: string;
      sourceAccount: string;
      feeEstimate: any;
      contractId: string;
      rpcUrl: string;
    };
  }> {
    try {
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        return {
          success: false,
          message: `Raffle ${raffleId} already finalized`,
        };
      }

      let finalPrizeAmount = prizeAmount;
      if (finalPrizeAmount === undefined) {
        const raffleData = await this.contractService.getRaffleData(raffleId);
        finalPrizeAmount = raffleData.prizeAmount;
      }

      const method = this.determineMethod(finalPrizeAmount);
      const randomness = await this.computeRandomness(method, requestId);
      const estimate = await this.txSubmitter.estimateRandomnessSubmission(raffleId, randomness);

      return {
        success: true,
        message: `Preview ready`,
        preview: {
          raffleId,
          requestId,
          prizeAmount: finalPrizeAmount,
          method,
          network: estimate.networkPassphrase,
          sourceAccount: estimate.sourceAddress,
          feeEstimate: estimate.feeEstimate,
          contractId: estimate.contractId,
          rpcUrl: estimate.rpcUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to build preview: ${error.message}`,
      };
    }
  }

  async previewReEnqueueJob(
    jobId: string,
  ): Promise<{
    success: boolean;
    message: string;
    preview?: {
      jobId: string;
      raffleId: number;
      requestId: string;
      alreadyFinalized: boolean;
    };
  }> {
    const job = await this.randomnessQueue.getJob(jobId);
    if (!job) {
      return { success: false, message: `Job ${jobId} not found` };
    }

    const payload = job.data as RandomnessJobPayload;
    const alreadySubmitted = await this.contractService.isRandomnessSubmitted(payload.raffleId);

    if (alreadySubmitted) {
      return {
        success: false,
        message: `Raffle ${payload.raffleId} already finalized, cannot re-enqueue`,
        preview: {
          jobId,
          raffleId: payload.raffleId,
          requestId: payload.requestId,
          alreadyFinalized: true,
        },
      };
    }

    return {
      success: true,
      message: `Preview ready`,
      preview: {
        jobId,
        raffleId: payload.raffleId,
        requestId: payload.requestId,
        alreadyFinalized: false,
      },
    };
  }

  async previewForceFailJob(
    jobId: string,
  ): Promise<{
    success: boolean;
    message: string;
    preview?: {
      jobId: string;
      raffleId: number;
      requestId: string;
    };
  }> {
    const job = await this.randomnessQueue.getJob(jobId);
    if (!job) {
      return { success: false, message: `Job ${jobId} not found` };
    }

    const payload = job.data as RandomnessJobPayload;
    return {
      success: true,
      message: `Preview ready`,
      preview: {
        jobId,
        raffleId: payload.raffleId,
        requestId: payload.requestId,
      },
    };
  }

  /**
   * Force fail a job (mark as invalid/malicious)
   */
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
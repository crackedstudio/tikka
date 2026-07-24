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
export class RescueService {
  
  private readonly rescueLogs: RescueLogEntry[] = [];
  private readonly HIGH_STAKES_THRESHOLD_XLM = 500;

  /** Ledger lag at or above which a pending request is considered stuck. */
  private readonly STUCK_LEDGER_LAG: number;
  /** Queue age at or above which an in-flight job is considered stuck. */
  private readonly STUCK_QUEUE_AGE_MS = 5 * 60 * 1000;
  /** Below these thresholds a pending request is considered healthy. */
  private readonly PENDING_HEALTHY_MAX_LEDGER_LAG = 50;
  private readonly PENDING_HEALTHY_MAX_AGE_MS = 2 * 60 * 1000;

  constructor(
    private readonly logger: OracleLoggerService,
    @InjectQueue(RANDOMNESS_QUEUE) private readonly randomnessQueue: Queue,
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
    private readonly lagMonitor: LagMonitorService,
    private readonly healthService: HealthService,
  ) {
    this.STUCK_LEDGER_LAG = this.lagMonitor.getLagThresholdLedgers();
  }

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
        JSON.stringify({ raffle_id: payload.raffleId, request_id: payload.requestId, outcome: 'success' } as OracleLogFields),
      );

      return {
        success: true,
        message: `Job re-enqueued successfully`,
        newJobId: newJob.id?.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to re-enqueue job ${jobId}: ${error.message}`,
        JSON.stringify({ outcome: 'failure' } as OracleLogFields),
      );
      
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
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, tx_hash: result.txHash, outcome: 'success' } as OracleLogFields),
      );

      return {
        success: true,
        message: `Randomness submitted successfully`,
        txHash: result.txHash,
      };
    } catch (error) {
      this.logger.error(
        `Failed to force submit for raffle ${raffleId}: ${error.message}`,
        JSON.stringify({ raffle_id: raffleId, request_id: requestId, outcome: 'failure' } as OracleLogFields),
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
        JSON.stringify({ raffle_id: payload.raffleId, request_id: payload.requestId, outcome: 'failure' } as OracleLogFields),
      );

      return {
        success: true,
        message: `Job marked as failed and removed from queue`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to force fail job ${jobId}: ${error.message}`,
        JSON.stringify({ outcome: 'failure' } as OracleLogFields),
      );

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

  /**
   * Build a stuck-draw report by correlating Bull queue jobs, lag monitor,
   * contract raffle state, and recent health errors.
   */
  async getStuckDrawReport(): Promise<StuckDrawReport> {
    const currentLedger = this.lagMonitor.getCurrentLedger();
    const candidates = new Map<string, DrawCandidate>();
    const errorByRequest = this.buildErrorIndex();

    this.mergeLagPending(candidates);
    await this.mergeQueueJobs(candidates);

    const contractCache = new Map<number, string>();
    const entries: StuckDrawReportEntry[] = [];

    for (const candidate of candidates.values()) {
      const contractStatus = await this.resolveContractStatus(
        candidate.raffleId,
        contractCache,
      );
      const ledgerRange = this.buildLedgerRange(candidate, currentLedger);
      const ageMs = this.computeAgeMs(candidate);
      const lastError = this.resolveLastError(candidate, errorByRequest);
      const signals = this.collectSignals(
        candidate,
        contractStatus,
        ledgerRange,
        ageMs,
        lastError,
      );
      const status = this.classifyDrawRequest(
        candidate,
        contractStatus,
        ledgerRange,
        ageMs,
        signals,
      );
      const nextStep = this.buildNextStep(status, candidate);

      entries.push({
        raffleId: candidate.raffleId,
        requestId: candidate.requestId,
        jobId: candidate.jobId,
        status,
        ageMs,
        since: this.resolveSinceIso(candidate),
        contractStatus,
        queueState: candidate.queueState,
        ledgerRange,
        lastError,
        nextStep,
        signals,
      });
    }

    entries.sort((a, b) => {
      const order: Record<DrawRequestStatus, number> = {
        stuck: 0,
        failed: 1,
        pending: 2,
        confirmed: 3,
      };
      const byStatus = order[a.status] - order[b.status];
      if (byStatus !== 0) return byStatus;
      return b.ageMs - a.ageMs;
    });

    return {
      timestamp: new Date().toISOString(),
      currentLedger,
      thresholds: {
        stuckLedgerLag: this.STUCK_LEDGER_LAG,
        stuckQueueAgeMs: this.STUCK_QUEUE_AGE_MS,
        pendingHealthyMaxLedgerLag: this.PENDING_HEALTHY_MAX_LEDGER_LAG,
        pendingHealthyMaxAgeMs: this.PENDING_HEALTHY_MAX_AGE_MS,
      },
      entries,
      summary: this.summarizeEntries(entries),
    };
  }

  private buildErrorIndex(): Map<string, string> {
    const index = new Map<string, string>();
    for (const err of this.healthService.getMetrics().recentErrors) {
      if (!index.has(err.requestId)) {
        index.set(err.requestId, err.error);
      }
    }
    return index;
  }

  private mergeLagPending(candidates: Map<string, DrawCandidate>): void {
    for (const pending of this.lagMonitor.getPendingRequests()) {
      const key = this.candidateKey(pending.raffleId, pending.requestId);
      const existing = candidates.get(key);
      candidates.set(key, {
        raffleId: pending.raffleId,
        requestId: pending.requestId,
        jobId: existing?.jobId,
        queueState: existing?.queueState,
        failedReason: existing?.failedReason,
        jobTimestamp: existing?.jobTimestamp,
        requestedAtLedger: pending.requestedAtLedger,
        trackedAt: pending.timestamp,
        attempts: existing?.attempts,
      });
    }
  }

  private async mergeQueueJobs(candidates: Map<string, DrawCandidate>): Promise<void> {
    const allJobs = await this.getAllJobs();
    const buckets: { jobs: JobInfo[]; state: string }[] = [
      { jobs: allJobs.waiting, state: 'waiting' },
      { jobs: allJobs.active, state: 'active' },
      { jobs: allJobs.delayed, state: 'delayed' },
      { jobs: allJobs.failed, state: 'failed' },
      { jobs: allJobs.completed, state: 'completed' },
    ];

    for (const { jobs, state } of buckets) {
      for (const job of jobs) {
        const key = this.candidateKey(job.raffleId, job.requestId);
        const existing = candidates.get(key);
        candidates.set(key, {
          raffleId: job.raffleId,
          requestId: job.requestId,
          jobId: job.id,
          queueState: state,
          failedReason: job.failedReason,
          jobTimestamp: job.timestamp,
          requestedAtLedger: existing?.requestedAtLedger,
          trackedAt: existing?.trackedAt ?? new Date(job.timestamp),
          attempts: job.attempts,
        });
      }
    }
  }

  private async resolveContractStatus(
    raffleId: number,
    cache: Map<number, string>,
  ): Promise<string> {
    if (cache.has(raffleId)) {
      return cache.get(raffleId)!;
    }
    try {
      const data = await this.contractService.getRaffleData(raffleId);
      cache.set(raffleId, data.status);
      return data.status;
    } catch (error: any) {
      this.logger.warn(
        `Could not fetch contract status for raffle ${raffleId}: ${error.message}`,
      );
      cache.set(raffleId, 'UNKNOWN');
      return 'UNKNOWN';
    }
  }

  private buildLedgerRange(
    candidate: DrawCandidate,
    currentLedger: number,
  ): StuckDrawLedgerRange {
    const requestedAtLedger = candidate.requestedAtLedger ?? 0;
    const lagLedgers =
      requestedAtLedger > 0 && currentLedger > 0
        ? Math.max(0, currentLedger - requestedAtLedger)
        : 0;
    return { requestedAtLedger, currentLedger, lagLedgers };
  }

  private computeAgeMs(candidate: DrawCandidate): number {
    const since = candidate.trackedAt?.getTime() ?? candidate.jobTimestamp ?? Date.now();
    return Math.max(0, Date.now() - since);
  }

  private resolveSinceIso(candidate: DrawCandidate): string {
    const since = candidate.trackedAt ?? new Date(candidate.jobTimestamp ?? Date.now());
    return since.toISOString();
  }

  private resolveLastError(
    candidate: DrawCandidate,
    errorByRequest: Map<string, string>,
  ): string | null {
    if (candidate.failedReason) {
      return candidate.failedReason;
    }
    return errorByRequest.get(candidate.requestId) ?? null;
  }

  private collectSignals(
    candidate: DrawCandidate,
    contractStatus: string,
    ledgerRange: StuckDrawLedgerRange,
    ageMs: number,
    lastError: string | null,
  ): string[] {
    const signals: string[] = [];

    if (contractStatus === 'FINALIZED' || contractStatus === 'CANCELLED') {
      signals.push(`contract:${contractStatus}`);
    } else if (contractStatus === 'DRAWING') {
      signals.push('contract:DRAWING');
    }

    if (candidate.queueState) {
      signals.push(`queue:${candidate.queueState}`);
    }

    if (ledgerRange.lagLedgers >= this.STUCK_LEDGER_LAG) {
      signals.push(`ledger_lag:${ledgerRange.lagLedgers}`);
    } else if (
      ledgerRange.lagLedgers > 0 &&
      ledgerRange.lagLedgers <= this.PENDING_HEALTHY_MAX_LEDGER_LAG
    ) {
      signals.push(`ledger_lag_healthy:${ledgerRange.lagLedgers}`);
    }

    if (ageMs >= this.STUCK_QUEUE_AGE_MS) {
      signals.push(`queue_age_exceeded:${ageMs}ms`);
    } else if (ageMs <= this.PENDING_HEALTHY_MAX_AGE_MS) {
      signals.push(`queue_age_healthy:${ageMs}ms`);
    }

    if (lastError) {
      signals.push('has_last_error');
    }

    return signals;
  }

  private classifyDrawRequest(
    candidate: DrawCandidate,
    contractStatus: string,
    ledgerRange: StuckDrawLedgerRange,
    ageMs: number,
    signals: string[],
  ): DrawRequestStatus {
    const finalized =
      contractStatus === 'FINALIZED' ||
      contractStatus === 'CANCELLED' ||
      candidate.queueState === 'completed';

    if (finalized) {
      return 'confirmed';
    }

    if (candidate.queueState === 'failed') {
      return 'failed';
    }

    const ledgerStuck =
      ledgerRange.lagLedgers >= this.STUCK_LEDGER_LAG && ledgerRange.requestedAtLedger > 0;
    const queueStuck =
      ageMs >= this.STUCK_QUEUE_AGE_MS &&
      ['waiting', 'active', 'delayed'].includes(candidate.queueState ?? '');
    const drawingStuck =
      contractStatus === 'DRAWING' && (ledgerStuck || queueStuck);

    if (ledgerStuck || queueStuck || drawingStuck) {
      return 'stuck';
    }

    const pendingHealthy =
      (ledgerRange.lagLedgers === 0 ||
        ledgerRange.lagLedgers <= this.PENDING_HEALTHY_MAX_LEDGER_LAG) &&
      ageMs <= this.PENDING_HEALTHY_MAX_AGE_MS &&
      ['waiting', 'active', 'delayed'].includes(candidate.queueState ?? '');

    const lagPending = signals.some((s) => s.startsWith('ledger_lag_healthy'));

    if (
      pendingHealthy ||
      lagPending ||
      candidate.queueState === 'waiting' ||
      candidate.queueState === 'active'
    ) {
      return 'pending';
    }

    if (contractStatus === 'DRAWING' || candidate.requestedAtLedger) {
      return 'pending';
    }

    return 'pending';
  }

  private buildNextStep(status: DrawRequestStatus, candidate: DrawCandidate): string {
    const { raffleId, requestId, jobId } = candidate;

    switch (status) {
      case 'confirmed':
        return 'No action required — randomness is confirmed on-chain (contract finalized or queue job completed).';

      case 'pending':
        return 'No action required — draw request is within normal processing window. Monitor with GET /rescue/stuck-draws or npm run oracle:rescue list-stuck.';

      case 'failed':
        if (jobId) {
          return `Re-enqueue failed job: npm run oracle:rescue re-enqueue ${jobId} --operator <name> --reason "<reason>". If retries are exhausted, use force-submit instead.`;
        }
        return `Force submit randomness: npm run oracle:rescue force-submit ${raffleId} ${requestId} --operator <name> --reason "<reason>"`;

      case 'stuck':
        if (jobId && candidate.queueState === 'failed') {
          return `Re-enqueue stuck failed job: npm run oracle:rescue re-enqueue ${jobId} --operator <name> --reason "<reason>". If re-enqueue fails, force-submit: npm run oracle:rescue force-submit ${raffleId} ${requestId} --operator <name> --reason "<reason>"`;
        }
        if (jobId) {
          return `Job appears stuck in queue state "${candidate.queueState}". Re-enqueue: npm run oracle:rescue re-enqueue ${jobId} --operator <name> --reason "<reason>", or force-submit: npm run oracle:rescue force-submit ${raffleId} ${requestId} --operator <name> --reason "<reason>"`;
        }
        return `Draw is stuck (ledger lag or contract DRAWING). Force submit: npm run oracle:rescue force-submit ${raffleId} ${requestId} --operator <name> --reason "<reason>"`;

      default:
        return 'Investigate draw state manually via GET /rescue/stuck-draws.';
    }
  }

  private summarizeEntries(entries: StuckDrawReportEntry[]): StuckDrawReportSummary {
    const summary: StuckDrawReportSummary = {
      stuck: 0,
      pending: 0,
      confirmed: 0,
      failed: 0,
      total: entries.length,
    };
    for (const entry of entries) {
      summary[entry.status]++;
    }
    return summary;
  }

  private candidateKey(raffleId: number, requestId: string): string {
    return `${raffleId}:${requestId}`;
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

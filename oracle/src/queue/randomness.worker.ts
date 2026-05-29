import { RandomnessRequest, RandomnessMethod, RandomnessResult, JobPriority } from './queue.types';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { MultiOracleCoordinatorService } from '../multi-oracle/multi-oracle-coordinator.service';
import { PriorityClassifierService } from './priority-classifier.service';
import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from './randomness.queue';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Processor(RANDOMNESS_QUEUE)
@Injectable()
export class RandomnessWorker {
  private readonly logger = new Logger(RandomnessWorker.name);
  private readonly vrfThresholdXlm: number;
  private readonly processedRequestIds = new Set<string>();
  private highPriorityJobStartTimes = new Map<string, number>();

  constructor(
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
    private readonly healthService: HealthService,
    private readonly lagMonitor: LagMonitorService,
    private readonly oracleRegistry: OracleRegistryService,
    private readonly multiOracleCoordinator: MultiOracleCoordinatorService,
    private readonly configService: ConfigService,
  ) {
    this.vrfThresholdXlm = Number(
      this.configService.get<string>('VRF_THRESHOLD_XLM', '500'),
    );
  }

  @Process()
  async handleRandomnessJob(job: Job<RandomnessJobPayload>): Promise<void> {
    const priority = job.opts.priority ?? JobPriority.NORMAL;
    const isHighPriority = priority <= JobPriority.HIGH;
    
    if (isHighPriority) {
      this.highPriorityJobStartTimes.set(job.data.requestId, Date.now());
    }

    this.logger.log(
      `Processing randomness request job ${job.id} for raffle ${job.data.raffleId}, request ${job.data.requestId}, priority=${priority}`,
    );
    
    await this.processRequest(job.data);

    if (isHighPriority) {
      this.trackHighPrioritySLA(job.data.requestId);
    }
  }

  clearProcessedCache() {
    this.processedRequestIds.clear();
  }

  async processRequest(request: RandomnessRequest): Promise<void> {
    const { raffleId, requestId, prizeAmount } = request;

    if (this.processedRequestIds.has(requestId)) {
      return;
    }

    // Support ORACLE_MODE=multi env toggle as well as legacy isMultiOracleMode()
    const oracleMode = this.configService.get<string>('ORACLE_MODE', 'single').toLowerCase();
    const isMultiOracle = oracleMode === 'multi' || this.oracleRegistry.isMultiOracleMode();
    const localOracleId = this.oracleRegistry.getLocalOracleId();

    if (isMultiOracle) {
      await this.processMultiOracleRequest(request, localOracleId);
    } else {
      await this.processSingleOracleRequest(request);
    }
  }

  private async processSingleOracleRequest(request: RandomnessRequest): Promise<void> {
    const { raffleId, requestId } = request;

    try {
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        return;
      }

      const raffleData = await this.contractService.getRaffleData(raffleId);
      const finalPrizeAmount = raffleData.prizeAmount;

      const method = this.determineMethod(finalPrizeAmount);
      this.logger.log(
        `requestId=${requestId} raffle=${raffleId} prize=${finalPrizeAmount} provider=${method === RandomnessMethod.VRF ? 'vrf' : 'prng'}`,
      );

      const randomness = await this.computeRandomness(method, requestId, raffleId);
      const result = await this.txSubmitter.submitRandomness(raffleId, randomness);

      if (!result.success) {
        throw new Error(`Transaction submission failed for raffle ${raffleId}`);
      }

      this.processedRequestIds.add(requestId);

      this.logger.log(
        `Successfully submitted randomness for raffle ${raffleId}: tx=${result.txHash}, ledger=${result.ledger}`,
      );
      this.healthService.recordSuccess(requestId);
      this.lagMonitor.fulfillRequest(requestId);
    } catch (error) {
      this.logger.error(
        `Failed to process randomness request for raffle ${raffleId}: ${error.message}`,
        error.stack,
      );
      this.healthService.recordFailure(requestId, raffleId, error.message);
      throw error;
    }
  }

  private async processMultiOracleRequest(
    request: RandomnessRequest,
    localOracleId: string,
  ): Promise<void> {
    const { raffleId, requestId } = request;
    const threshold = this.oracleRegistry.getThreshold();

    this.logger.log(
      `Multi-oracle mode: raffle=${raffleId}, request=${requestId}, localOracle=${localOracleId}, threshold=${threshold}`
    );

    try {
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        return;
      }

      const raffleData = await this.contractService.getRaffleData(raffleId);
      const finalPrizeAmount = raffleData.prizeAmount;

      const method = this.determineMethod(finalPrizeAmount);
      this.logger.log(
        `requestId=${requestId} raffle=${raffleId} prize=${finalPrizeAmount} provider=${method === RandomnessMethod.VRF ? 'vrf' : 'prng'}`,
      );

      // Compute local oracle's VRF output
      const localRandomness = await this.computeRandomness(method, requestId);

      // Broadcast to peers and collect responses; aggregate via XOR
      const { aggregated, usedOracles, fellBack } =
        await this.multiOracleCoordinator.broadcastAndCollect(requestId, localRandomness);

      if (fellBack) {
        this.logger.warn(
          `Raffle ${raffleId}: fell back to single-oracle (threshold not met in time)`
        );
      } else {
        this.logger.log(
          `Raffle ${raffleId}: consensus from [${usedOracles.join(', ')}], submitting aggregated seed`
        );
      }

      const result = await this.txSubmitter.submitRandomness(raffleId, aggregated);

      if (!result.success) {
        throw new Error(`Transaction submission failed for raffle ${raffleId}`);
      }

      this.processedRequestIds.add(requestId);

      // Record in coordinator for observability
      if (!this.multiOracleCoordinator.isTracked(raffleId, requestId)) {
        await this.multiOracleCoordinator.startTracking(raffleId, requestId);
      }
      const localOracle = this.oracleRegistry.getLocalOracle();
      if (localOracle) {
        this.multiOracleCoordinator.recordSubmission(
          raffleId, requestId, localOracleId, localOracle.publicKey, aggregated, result.txHash,
        );
      }

      this.logger.log(
        `Successfully submitted multi-oracle randomness for raffle ${raffleId}: tx=${result.txHash}, ledger=${result.ledger}`
      );
      this.healthService.recordSuccess(requestId);
      this.lagMonitor.fulfillRequest(requestId);
    } catch (error) {
      this.logger.error(
        `Failed to process multi-oracle request for raffle ${raffleId}: ${error.message}`,
        error.stack,
      );
      this.healthService.recordFailure(`${requestId}:${localOracleId}`, raffleId, error.message);
      throw error;
    }
  }

  async computeRandomnessForOracle(
    method: RandomnessMethod,
    requestId: string,
    oracleId: string,
  ): Promise<RandomnessResult> {
    if (method === RandomnessMethod.VRF) {
      return this.vrfService.computeForOracle(requestId, oracleId);
    } else {
      return this.prngService.compute(requestId);
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`Completed job ${job.id} of type ${job.name}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}: ${err.message}`);
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.error(
        `[ALERT] Job ${job.id} exhausted all ${job.opts.attempts} attempts for raffle ${job.data?.raffleId}, request ${job.data?.requestId}. Manual intervention required.`,
      );
    }
  }

  private determineMethod(prizeAmount: number): RandomnessMethod {
    return prizeAmount >= this.vrfThresholdXlm
      ? RandomnessMethod.VRF
      : RandomnessMethod.PRNG;
  }

  private async computeRandomness(method: RandomnessMethod, requestId: string, raffleId?: number) {
    if (method === RandomnessMethod.VRF) {
      return await this.vrfService.compute(requestId, raffleId);
    } else {
      return await this.prngService.compute(requestId, raffleId);
    }
  }

  private trackHighPrioritySLA(requestId: string): void {
    const startTime = this.highPriorityJobStartTimes.get(requestId);
    if (!startTime) return;

    const processingTime = Date.now() - startTime;
    const SLA_THRESHOLD_MS = 5000; // 5 seconds for high-priority jobs

    if (processingTime > SLA_THRESHOLD_MS) {
      this.logger.warn(
        `[SLA BREACH] High-priority job ${requestId} took ${processingTime}ms (threshold: ${SLA_THRESHOLD_MS}ms)`,
      );
    } else {
      this.logger.log(
        `[SLA OK] High-priority job ${requestId} completed in ${processingTime}ms`,
      );
    }

    this.highPriorityJobStartTimes.delete(requestId);
  }

  determinePriority(prizeAmount?: number, priorityFlag?: number): number {
    // If priority flag is explicitly set in contract event, use it
    if (priorityFlag !== undefined) {
      return priorityFlag;
    }

    // Otherwise, determine priority based on prize amount
    if (!prizeAmount) {
      return JobPriority.NORMAL;
    }

    if (prizeAmount >= this.vrfThresholdXlm) {
      return JobPriority.HIGH;
    }

    return JobPriority.NORMAL;
  }
}

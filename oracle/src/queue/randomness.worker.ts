import { RandomnessRequest, RandomnessMethod, RandomnessResult } from './queue.types';
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

@Processor(RANDOMNESS_QUEUE)
@Injectable()
export class RandomnessWorker {
  private readonly logger = new Logger(RandomnessWorker.name);
  private readonly HIGH_STAKES_THRESHOLD_XLM = 500;
  private readonly processedRequestIds = new Set<string>();

  constructor(
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
    private readonly healthService: HealthService,
    private readonly lagMonitor: LagMonitorService,
    private readonly oracleRegistry: OracleRegistryService,
    private readonly multiOracleCoordinator: MultiOracleCoordinatorService,
    private readonly priorityClassifier: PriorityClassifierService,
  ) {}

  @Process()
  async handleRandomnessJob(job: Job<RandomnessJobPayload>): Promise<void> {
    this.logger.log(
      `Processing randomness request job ${job.id} for raffle ${job.data.raffleId}, request ${job.data.requestId}`,
    );
    const { tier } = this.priorityClassifier.classify(job.data.prizeAmount);
    this.healthService.decrementTierCount(tier);
    await this.processRequest(job.data);
  }

  clearProcessedCache() {
    this.processedRequestIds.clear();
  }

  async processRequest(request: RandomnessRequest): Promise<void> {
    const { raffleId, requestId, prizeAmount } = request;

    if (this.processedRequestIds.has(requestId)) {
      return;
    }

    const isMultiOracle = this.oracleRegistry.isMultiOracleMode();
    const localOracleId = this.oracleRegistry.getLocalOracleId();

    if (isMultiOracle) {
      await this.processMultiOracleRequest(request, localOracleId);
    } else {
      await this.processSingleOracleRequest(request);
    }
  }

  private async processSingleOracleRequest(request: RandomnessRequest): Promise<void> {
    const { raffleId, requestId, prizeAmount } = request;

    try {
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        return;
      }

      let finalPrizeAmount = prizeAmount;
      if (finalPrizeAmount === undefined) {
        const raffleData = await this.contractService.getRaffleData(raffleId);
        finalPrizeAmount = raffleData.prizeAmount;
      }

      const method = this.determineMethod(finalPrizeAmount);
      this.logger.log(`Raffle ${raffleId}: prize=${finalPrizeAmount} XLM, method=${method}`);

      const randomness = await this.computeRandomness(method, requestId);
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
    const { raffleId, requestId, prizeAmount } = request;
    const threshold = this.oracleRegistry.getThreshold();

    this.logger.log(
      `Multi-oracle mode: raffle=${raffleId}, request=${requestId}, localOracle=${localOracleId}, threshold=${threshold}`
    );

    if (!this.multiOracleCoordinator.isTracked(raffleId, requestId)) {
      await this.multiOracleCoordinator.startTracking(raffleId, requestId);
    }

    if (this.multiOracleCoordinator.hasSubmitted(raffleId, requestId, localOracleId)) {
      this.logger.log(`Local oracle ${localOracleId} already submitted for ${requestId}`);
      return;
    }

    try {
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        return;
      }

      let finalPrizeAmount = prizeAmount;
      if (finalPrizeAmount === undefined) {
        const raffleData = await this.contractService.getRaffleData(raffleId);
        finalPrizeAmount = raffleData.prizeAmount;
      }

      const method = this.determineMethod(finalPrizeAmount);
      const randomness = await this.computeRandomness(method, requestId);

      const localOracle = this.oracleRegistry.getLocalOracle();
      if (!localOracle) {
        throw new Error(`Local oracle not found: ${localOracleId}`);
      }

      const { ready, aggregated } = this.multiOracleCoordinator.recordSubmission(
        raffleId,
        requestId,
        localOracleId,
        localOracle.publicKey,
        randomness,
      );

      this.logger.log(
        `Recorded submission from ${localOracleId} for raffle ${raffleId}: ready=${ready}`
      );

      this.processedRequestIds.add(`${requestId}:${localOracleId}`);
      this.healthService.recordSuccess(`${requestId}:${localOracleId}`);
      this.lagMonitor.fulfillRequest(requestId);

      if (ready && aggregated) {
        this.logger.log(
          `Threshold reached for raffle ${raffleId}: ${aggregated.submittedBy.length}/${threshold} oracles`
        );
      }
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
    return prizeAmount >= this.HIGH_STAKES_THRESHOLD_XLM
      ? RandomnessMethod.VRF
      : RandomnessMethod.PRNG;
  }

  private async computeRandomness(method: RandomnessMethod, requestId: string) {
    if (method === RandomnessMethod.VRF) {
      return await this.vrfService.compute(requestId);
    } else {
      return await this.prngService.compute(requestId);
    }
  }
}


import { RandomnessRequest, RandomnessMethod } from './queue.types';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from './randomness.queue';
import { Injectable, Logger } from '@nestjs/common';

@Processor(RANDOMNESS_QUEUE)
@Injectable()
export class RandomnessWorker {
  private readonly logger = new Logger(RandomnessWorker.name);
  private readonly HIGH_STAKES_THRESHOLD_XLM = 500;

  constructor(
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
    private readonly healthService: HealthService,
    private readonly lagMonitor: LagMonitorService,
  ) { }

  /**
   * Processes a randomness request from the queue
   * @param job The Bull job containing the randomness request
   * @returns Processing result
   */
  @Process()
  async handleRandomnessJob(job: Job<RandomnessJobPayload>): Promise<void> {
    const { raffleId, requestId, prizeAmount } = job.data;

    this.logger.log(`Processing randomness request job ${job.id} for raffle ${raffleId}, request ${requestId}`);

    try {
      // Step 1: Check if randomness already submitted to contract
      // This is the source-of-truth idempotency check
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        return;
      }

      // Step 2: Determine prize amount if not in event payload
      let finalPrizeAmount = prizeAmount;
      if (finalPrizeAmount === undefined) {
        const raffleData = await this.contractService.getRaffleData(raffleId);
        finalPrizeAmount = raffleData.prizeAmount;
      }

      // Step 3: Determine high-stakes vs low-stakes
      const method = this.determineMethod(finalPrizeAmount);
      this.logger.log(`Raffle ${raffleId}: prize=${finalPrizeAmount} XLM, method=${method}`);

      // Step 4: Compute randomness (VRF or PRNG)
      const randomness = await this.computeRandomness(method, requestId);

      // Step 5: Submit to contract
      const result = await this.txSubmitter.submitRandomness(raffleId, randomness);

      if (result.success) {
        this.logger.log(
          `Successfully submitted randomness for raffle ${raffleId}: tx=${result.txHash}, ledger=${result.ledger}`,
        );
        this.healthService.recordSuccess(requestId);
        this.lagMonitor.fulfillRequest(requestId);
      } else {
        throw new Error(`Transaction submission failed for raffle ${raffleId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process randomness request for raffle ${raffleId}: ${error.message}`,
        error.stack,
      );
      this.healthService.recordFailure(requestId, raffleId, error.message);
      throw error; // Re-throw to trigger Bull retry mechanism
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
  }

  /**
   * Determines whether to use VRF or PRNG based on prize amount
   */
  private determineMethod(prizeAmount: number): RandomnessMethod {
    return prizeAmount >= this.HIGH_STAKES_THRESHOLD_XLM
      ? RandomnessMethod.VRF
      : RandomnessMethod.PRNG;
  }

  /**
   * Computes randomness using the appropriate method
   */
  private async computeRandomness(method: RandomnessMethod, requestId: string) {
    if (method === RandomnessMethod.VRF) {
      return await this.vrfService.compute(requestId);
    } else {
      return await this.prngService.compute(requestId);
    }
  }
}


import { RandomnessMethod } from './queue.types';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from './randomness.queue';
import { Injectable, Logger } from '@nestjs/common';
import { AuditLoggerService } from '../audit/audit-logger.service';
import { BatchCollector } from './batch-collector.service';
import { RevealItem, BatchFlushResult } from './batch-reveal.types';

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
    private readonly auditLogger: AuditLoggerService,
    private readonly batchCollector: BatchCollector,
    @InjectQueue(RANDOMNESS_QUEUE) private readonly randomnessQueue: Queue,
  ) {
    this.batchCollector.onFlush(this.handleFlush.bind(this));
  }

  /**
   * Flush handler — called by BatchCollector when a batch is ready to submit.
   */
  private async handleFlush(flushResult: BatchFlushResult): Promise<void> {
    const { items } = flushResult;
    const batchSize = items.length;

    const batchResult = await this.txSubmitter.submitBatch(items);

    const { txHash, ledger } = batchResult;
    let successes = 0;
    let failures = 0;

    // Build a map from raffleId to RevealItem for quick lookup
    const itemMap = new Map<number, RevealItem>(items.map((i) => [i.raffleId, i]));

    for (const resultItem of batchResult.items) {
      const revealItem = itemMap.get(resultItem.raffleId);

      if (resultItem.success) {
        successes++;
        if (revealItem) {
          try {
            await this.auditLogger.log({
              raffle_id: revealItem.raffleId,
              request_id: revealItem.requestId,
              seed: revealItem.seed,
              proof: revealItem.proof,
              tx_hash: txHash,
              method: revealItem.method,
            });
          } catch (err: any) {
            this.logger.error(
              `Audit log failed for raffle ${revealItem.raffleId}: ${err?.message}`,
            );
          }
        }
      } else {
        failures++;
        if (resultItem.errorCode === 'ALREADY_FINALISED') {
          this.logger.debug(
            `Raffle ${resultItem.raffleId} already finalised — discarding silently`,
          );
        } else {
          this.logger.error(
            `RevealItem failed for raffle ${resultItem.raffleId}: ${resultItem.errorCode ?? 'UNKNOWN'}`,
          );
          // Re-enqueue as a new Bull job for retry
          try {
            await this.randomnessQueue.add({ raffleId: resultItem.raffleId } as RandomnessJobPayload);
          } catch (err: any) {
            this.logger.error(
              `Failed to re-enqueue raffle ${resultItem.raffleId}: ${err?.message}`,
            );
          }
        }
      }
    }

    // Record batch metrics (guard for task 9 which adds this method)
    if (typeof (this.healthService as any).recordBatchSubmission === 'function') {
      (this.healthService as any).recordBatchSubmission(batchSize, successes, failures);
    }

    this.logger.log(
      `Batch submitted: size=${batchSize}, txHash=${txHash}, ledger=${ledger}, successes=${successes}, failures=${failures}`,
    );
  }

  /**
   * Processes a randomness request from the queue
   */
  @Process()
  async handleRandomnessJob(job: Job<RandomnessJobPayload>): Promise<void> {
    this.logger.log(
      `Processing randomness request job ${job.id} for raffle ${job.data.raffleId}, request ${job.data.requestId}`,
    );
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

import { Injectable, Logger } from '@nestjs/common';
import { RandomnessRequest, RandomnessMethod } from './queue.types';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';

@Injectable()
export class RandomnessWorker {
  private readonly logger = new Logger(RandomnessWorker.name);
  private readonly HIGH_STAKES_THRESHOLD_XLM = 500;
  private readonly processedRequests = new Set<string>();

  constructor(
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
  ) {}

  /**
   * Processes a randomness request from the queue
   * @param job The randomness request job
   * @returns Processing result
   */
  async processRequest(job: RandomnessRequest): Promise<void> {
    const { raffleId, requestId, prizeAmount } = job;
    
    this.logger.log(`Processing randomness request for raffle ${raffleId}, request ${requestId}`);

    try {
      // Step 1: Check for duplicate processing (idempotency)
      if (this.processedRequests.has(requestId)) {
        this.logger.warn(`Request ${requestId} already processed, skipping`);
        return;
      }

      // Step 2: Check if randomness already submitted to contract
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, skipping`);
        this.processedRequests.add(requestId);
        return;
      }

      // Step 3: Determine prize amount if not in event payload
      let finalPrizeAmount = prizeAmount;
      if (finalPrizeAmount === undefined) {
        const raffleData = await this.contractService.getRaffleData(raffleId);
        finalPrizeAmount = raffleData.prizeAmount;
      }

      // Step 4: Determine high-stakes vs low-stakes
      const method = this.determineMethod(finalPrizeAmount);
      this.logger.log(`Raffle ${raffleId}: prize=${finalPrizeAmount} XLM, method=${method}`);

      // Step 5: Compute randomness (VRF or PRNG)
      const randomness = await this.computeRandomness(method, requestId);

      // Step 6: Submit to contract
      const result = await this.txSubmitter.submitRandomness(raffleId, randomness);
      
      if (result.success) {
        this.logger.log(
          `Successfully submitted randomness for raffle ${raffleId}: tx=${result.txHash}, ledger=${result.ledger}`,
        );
        this.processedRequests.add(requestId);
      } else {
        throw new Error(`Transaction submission failed for raffle ${raffleId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process randomness request for raffle ${raffleId}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to trigger retry mechanism
    }
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

  /**
   * Clears processed request cache (for testing or periodic cleanup)
   */
  clearProcessedCache(): void {
    this.processedRequests.clear();
  }
}

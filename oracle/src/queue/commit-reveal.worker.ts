import { Injectable, Logger } from '@nestjs/common';
import { CommitmentService } from '../randomness/commitment.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { ContractService } from '../contract/contract.service';

export interface CommitRequest {
  raffleId: number;
  endTime: number;
}

export interface RevealRequest {
  raffleId: number;
  requestId: string;
}

@Injectable()
export class CommitRevealWorker {
  private readonly logger = new Logger(CommitRevealWorker.name);

  constructor(
    private readonly commitmentService: CommitmentService,
    private readonly contractService: ContractService,
    private readonly txSubmitter: TxSubmitterService,
  ) {}

  /**
   * Commit phase: Called before raffle end_time
   * Generates commitment and submits to contract
   */
  async processCommit(request: CommitRequest): Promise<void> {
    const { raffleId } = request;
    
    this.logger.log(`Processing commit for raffle ${raffleId}`);

    try {
      const commitment = this.commitmentService.commit(raffleId);
      this.logger.log(`Commitment for raffle ${raffleId}: ${commitment}`);
      await this.txSubmitter.submitCommitment(raffleId, commitment);
      
    } catch (error) {
      this.logger.error(
        `Failed to process commit for raffle ${raffleId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Reveal phase: Called after draw triggered
   * Retrieves secret/nonce and submits to contract for verification
   */
  async processReveal(request: RevealRequest): Promise<void> {
    const { raffleId, requestId } = request;
    
    this.logger.log(`Processing reveal for raffle ${raffleId}`);

    try {
      // Retrieve commitment data
      const reveal = this.commitmentService.reveal(raffleId);
      
      if (!reveal) {
        throw new Error(`No commitment found for raffle ${raffleId}`);
      }
      
      const { secret, nonce } = reveal;
      this.logger.log(`Revealing for raffle ${raffleId}`);
      await this.txSubmitter.submitReveal(raffleId, secret, nonce);
      
      // Clear commitment after successful reveal
      this.commitmentService.clearCommitment(raffleId);
      
    } catch (error) {
      this.logger.error(
        `Failed to process reveal for raffle ${raffleId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

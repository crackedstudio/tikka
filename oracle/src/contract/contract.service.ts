import { Injectable } from '@nestjs/common';

export interface RaffleData {
  raffleId: number;
  prizeAmount: number;
  status: string;
}

@Injectable()
export class ContractService {
  /**
   * Fetches raffle data from the Soroban contract
   * @param raffleId The raffle ID
   * @returns Raffle data including prize amount
   */
  async getRaffleData(raffleId: number): Promise<RaffleData> {
    // TODO: Implement Soroban RPC call to get_raffle_data
    // This will use stellar-sdk to simulate the read-only call
    throw new Error('Contract RPC not yet implemented');
  }

  /**
   * Checks if randomness has already been submitted for this raffle
   * @param raffleId The raffle ID
   * @returns True if already finalized
   */
  async isRandomnessSubmitted(raffleId: number): Promise<boolean> {
    const data = await this.getRaffleData(raffleId);
    return data.status === 'FINALIZED' || data.status === 'CANCELLED';
  }
}

import { Injectable } from '@nestjs/common';
import { nativeToScVal } from '@stellar/stellar-sdk';
import { ContractService } from '../../contract/contract.service';
import {
  BuyTicketParams,
  BuyTicketResult,
  RefundTicketParams,
  RefundTicketResult,
  GetUserTicketsParams,
} from './ticket.types';

@Injectable()
export class TicketService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Purchases tickets for a raffle.
   * Runs the full transaction lifecycle: simulate → sign → submit → poll.
   */
  async buy(params: BuyTicketParams): Promise<BuyTicketResult> {
    const { raffleId, quantity, sourceAddress, signer } = params;

    const result = await this.contractService.invoke(
      'buy_ticket',
      [
        nativeToScVal(raffleId, { type: 'u32' }),
        nativeToScVal(quantity, { type: 'u32' }),
      ],
      sourceAddress,
      signer,
    );

    return {
      ticketIds: [], // TODO: parse from result.resultXdr when contract ABI is available
      txHash: result.txHash,
      ledger: result.ledger,
      feePaid: '0', // TODO: derive from transaction metadata
    };
  }

  /**
   * Refunds a ticket (when raffle is cancelled).
   * Runs the full transaction lifecycle: simulate → sign → submit → poll.
   */
  async refund(params: RefundTicketParams): Promise<RefundTicketResult> {
    const { raffleId, ticketId, sourceAddress, signer } = params;

    const result = await this.contractService.invoke(
      'refund_ticket',
      [
        nativeToScVal(raffleId, { type: 'u32' }),
        nativeToScVal(ticketId, { type: 'u32' }),
      ],
      sourceAddress,
      signer,
    );

    return {
      txHash: result.txHash,
      ledger: result.ledger,
    };
  }

  /**
   * Gets all ticket IDs owned by a user for a specific raffle.
   * Read-only operation (no signing required).
   */
  async getUserTickets(params: GetUserTicketsParams): Promise<number[]> {
    const { raffleId, userAddress } = params;

    return this.contractService.simulateReadOnly<number[]>(
      'get_user_tickets',
      [
        nativeToScVal(raffleId, { type: 'u32' }),
        nativeToScVal(userAddress, { type: 'address' }),
      ],
    );
  }
}

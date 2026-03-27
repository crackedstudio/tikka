import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import {
  BuyTicketParams,
  BuyTicketResult,
  RefundTicketParams,
  RefundTicketResult,
  GetUserTicketsParams,
} from './ticket.types';
import { assertPositiveInt } from '../../utils/validation';

@Injectable()
export class TicketService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Purchases tickets for a raffle.
   * Requires wallet signature and submission.
   */
  async buy(params: BuyTicketParams): Promise<BuyTicketResult> {
    const { raffleId, quantity } = params;
    assertPositiveInt(raffleId, 'raffleId');
    assertPositiveInt(quantity, 'quantity');

    const publicKey = await this.contractService['wallet']?.getPublicKey();
    const { result, txHash, ledger } = await this.contractService.invoke<number[]>(
      ContractFn.BUY_TICKET,
      [raffleId, publicKey, quantity],
      { memo: params.memo },
    );

    return {
      ticketIds: result,
      txHash,
      ledger,
      feePaid: '0', // fee is included in tx metadata
    };
  }

  /**
   * Refunds a ticket (when raffle is cancelled).
   * Requires wallet signature and submission.
   */
  async refund(params: RefundTicketParams): Promise<RefundTicketResult> {
    const { raffleId, ticketId } = params;
    assertPositiveInt(raffleId, 'raffleId');
    assertPositiveInt(ticketId, 'ticketId');

    const { txHash, ledger } = await this.contractService.invoke(
      ContractFn.REFUND_TICKET,
      [raffleId, ticketId],
      { memo: params.memo },
    );

    return { txHash, ledger };
  }

  /**
   * Gets all ticket IDs owned by a user for a specific raffle.
   * Read-only operation (no signing required).
   */
  async getUserTickets(params: GetUserTicketsParams): Promise<number[]> {
    const { raffleId, userAddress } = params;
    assertPositiveInt(raffleId, 'raffleId');

    return this.contractService.simulateReadOnly<number[]>(
      ContractFn.GET_USER_TICKETS,
      [raffleId, userAddress],
    );
  }
}

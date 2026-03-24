import { TxSigner } from '../../wallet/wallet.adapter';

export interface BuyTicketParams {
  raffleId: number;
  quantity: number;
  sourceAddress: string;
  signer: TxSigner;
}

export interface BuyTicketResult {
  ticketIds: number[];
  txHash: string;
  ledger: number;
  feePaid: string;
}

export interface RefundTicketParams {
  raffleId: number;
  ticketId: number;
  sourceAddress: string;
  signer: TxSigner;
}

export interface RefundTicketResult {
  txHash: string;
  ledger: number;
}

export interface GetUserTicketsParams {
  raffleId: number;
  userAddress: string;
}

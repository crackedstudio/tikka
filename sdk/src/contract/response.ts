export interface TxResponse<T = any> {
  status: 'SUCCESS' | 'ERROR';
  value?: T;
  error?: string;
  txHash?: string;
  ledger?: number;
  feeCharged?: string;
  resultXdr?: string;
  warnings?: string[];
}

export type TicketTxResponse<T = number[]> = TxResponse<T>;
export type RaffleTxResponse<T = number> = TxResponse<T>;
export type AdminTxResponse<T = void> = TxResponse<T>;
export type UserTxResponse<T = any> = TxResponse<T>;

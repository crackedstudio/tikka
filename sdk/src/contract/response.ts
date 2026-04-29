export interface ContractResponse<T = any> {
  success: boolean;
  value?: T;
  error?: string;
  transactionHash?: string;
  ledger?: number;
}

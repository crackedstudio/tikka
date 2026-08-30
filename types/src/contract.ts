/**
 * Contract raffle data structure returned from smart contract
 */
export interface ContractRaffleData {
  id: number;
  creator: string; // Stellar address
  metadataId: string; // Supabase record ID
  ticketPrice: string; // Price in stroops (string to handle large numbers)
  totalTickets: number;
  ticketsSold: number;
  endTime: number; // Unix timestamp
  isActive: boolean;
  winner?: string; // Stellar address of winner (if drawn)
  prizeDistributed: boolean;
}

/**
 * User participation data for a specific raffle
 */
export interface ContractUserParticipation {
  raffleId: number;
  userAddress: string;
  ticketsPurchased: number;
  totalSpent: string; // Amount in stroops
  participationTime: number; // Unix timestamp
}

/**
 * Parameters for creating a new raffle
 */
export interface CreateRaffleParams {
  metadataId: string; // Supabase record ID containing off-chain data
  ticketPrice: string; // Price per ticket in stroops
  totalTickets: number;
  durationInSeconds: number;
}

/**
 * Contract function response wrapper
 */
export interface ContractResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  transactionHash?: string;
}

/**
 * Contract error types
 */
export const ContractErrorType = {
  NETWORK_ERROR: "NETWORK_ERROR",
  CONTRACT_ERROR: "CONTRACT_ERROR",
  WALLET_ERROR: "WALLET_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  RAFFLE_NOT_FOUND: "RAFFLE_NOT_FOUND",
  RAFFLE_ENDED: "RAFFLE_ENDED",
  RAFFLE_FULL: "RAFFLE_FULL",
  UNAUTHORIZED: "UNAUTHORIZED",
  CONTRACT_PAUSED: "CONTRACT_PAUSED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ContractErrorType =
  (typeof ContractErrorType)[keyof typeof ContractErrorType];

/**
 * Contract error details
 */
export interface ContractError {
  type: ContractErrorType;
  message: string;
  details?: unknown;
  transactionHash?: string;
}

/**
 * Transaction status for contract operations
 */
export interface ContractTransactionStatus {
  hash: string;
  status: "pending" | "success" | "failed";
  timestamp: number;
  operation: string;
  error?: ContractError;
}

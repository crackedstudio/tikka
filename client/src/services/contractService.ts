/**
 * Contract Service
 *
 * Service layer for interacting with the Soroban raffle smart contract.
 * Handles all contract read/write operations with proper error handling.
 *
 * Write operations (createRaffle, buyTickets) delegate to runPipeline so that
 * fee estimation, signing, submission, polling, and error handling are shared.
 */

import {
  Contract,
  rpc,
  TransactionBuilder,
  Account,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import type { Transaction } from "@stellar/stellar-sdk";
import { sorobanRpcServer } from "./rpcService";
import { CONTRACT_CONFIG } from "../config/contract";
import { getAccountAddress } from "./walletService";
import { runPipeline } from "./transactionPipeline";
import type { PipelineOptions, PipelineResult } from "./transactionPipeline";
import type {
  ContractRaffleData,
  ContractUserParticipation,
  CreateRaffleParams,
  BuyTicketParams,
  ContractResponse,
  ContractError,
} from "../types/types";
import { ContractErrorType } from "../types/types";
import { formatXlm } from "../utils/formatters";

/** Pre-confirmation fee preview for raffle creation (simulation-based, no submit). */
export interface CreateRaffleEstimate {
  xlm: string;
  stroops: string;
}

/**
 * Contract Service Class
 *
 * Provides methods for reading from and writing to the raffle smart contract
 */
export class ContractService {
  private static contract: Contract | null = null;

  /**
   * Initialize the contract instance
   */
  private static getContract(): Contract {
    if (!this.contract) {
      if (CONTRACT_CONFIG.address === "TBD") {
        throw new Error(
          "Contract address not configured. Please deploy the contract first.",
        );
      }

      this.contract = new Contract(CONTRACT_CONFIG.address);
    }
    return this.contract;
  }

  /**
   * Handle contract errors and convert to user-friendly messages
   */
  private static handleError(error: unknown, operation: string): ContractError {
    console.error(`❌ ContractService.${operation}:`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Contract paused
    if (errorMessage.includes('ContractPaused') || errorMessage.includes('contract_paused')) {
      return {
        type: ContractErrorType.CONTRACT_PAUSED,
        message: 'The platform is temporarily paused. Existing claims and refunds still work.',
        details: errorMessage,
      };
    }

    // Network errors
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection")
    ) {
      return {
        type: ContractErrorType.NETWORK_ERROR,
        message:
          "Network connection failed. Please check your internet connection.",
        details: errorMessage,
      };
    }

    // Wallet errors
    if (errorMessage.includes("wallet") || errorMessage.includes("sign")) {
      return {
        type: ContractErrorType.WALLET_ERROR,
        message:
          "Wallet operation failed. Please ensure your wallet is connected.",
        details: errorMessage,
      };
    }

    // Contract-specific errors
    if (errorMessage.includes("insufficient")) {
      return {
        type: ContractErrorType.INSUFFICIENT_FUNDS,
        message: "Insufficient funds to complete this transaction.",
        details: errorMessage,
      };
    }

    if (errorMessage.includes("not found")) {
      return {
        type: ContractErrorType.RAFFLE_NOT_FOUND,
        message: "Raffle not found or has been removed.",
        details: errorMessage,
      };
    }

    if (errorMessage.includes("ended")) {
      return {
        type: ContractErrorType.RAFFLE_ENDED,
        message: "This raffle has already ended.",
        details: errorMessage,
      };
    }

    if (errorMessage.includes("full")) {
      return {
        type: ContractErrorType.RAFFLE_FULL,
        message: "This raffle is sold out.",
        details: errorMessage,
      };
    }

    // Default error
    return {
      type: ContractErrorType.UNKNOWN_ERROR,
      message: "An unexpected error occurred. Please try again.",
      details: errorMessage,
    };
  }

  /**
   * Build an unsigned `create_raffle` transaction.
   *
   * Fetches the caller's account sequence from the RPC server and constructs a
   * `TransactionBuilder` operation for the `create_raffle` contract function.
   * The returned transaction is unsigned — it must be passed through the pipeline
   * (ESTIMATE → SIGN → SUBMIT) before it can be broadcast.
   *
   * @param params.metadataId       Supabase record ID containing off-chain raffle metadata
   * @param params.ticketPrice      Price per ticket in stroops (as a decimal string)
   * @param params.totalTickets     Maximum number of tickets available
   * @param params.durationInSeconds Raffle duration from now, in seconds
   * @returns Unsigned `Transaction` ready for simulation
   * @throws If the wallet is not connected or the RPC account fetch fails
   */
  static async buildCreateRaffleTx(params: CreateRaffleParams): Promise<Transaction> {
    const userAddress = await getAccountAddress();
    if (!userAddress) throw new Error("Wallet not connected");

    const contract = ContractService.getContract();
    const operation = contract.call(
      CONTRACT_CONFIG.functions.createRaffle,
      nativeToScVal({
        metadata_id: params.metadataId,
        ticket_price: BigInt(params.ticketPrice),
        max_tickets: params.totalTickets,
        end_time: Math.floor(Date.now() / 1000) + params.durationInSeconds,
      }),
    );

    const account = await sorobanRpcServer.getAccount(userAddress);
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: CONTRACT_CONFIG.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
  }

  /**
   * Build an unsigned `buy_ticket` transaction.
   *
   * Fetches the caller's account sequence from the RPC server and constructs a
   * `TransactionBuilder` operation for the `buy_ticket` contract function.
   * The returned transaction is unsigned — it must be passed through the pipeline
   * (ESTIMATE → SIGN → SUBMIT) before it can be broadcast.
   *
   * @param params.raffleId           On-chain raffle ID to purchase tickets for
   * @param params.ticketCount        Number of tickets to buy in this transaction
   * @param params.maxPricePerTicket  Slippage guard: maximum acceptable price per ticket in stroops
   * @returns Unsigned `Transaction` ready for simulation
   * @throws If the wallet is not connected or the RPC account fetch fails
   */
  static async buildBuyTicketsTx(params: BuyTicketParams): Promise<Transaction> {
    const userAddress = await getAccountAddress();
    if (!userAddress) throw new Error("Wallet not connected");

    const contract = ContractService.getContract();
    const operation = contract.call(
      CONTRACT_CONFIG.functions.buyTicket,
      nativeToScVal(params.raffleId, { type: "u32" }),
      nativeToScVal(params.ticketCount, { type: "u32" }),
      nativeToScVal(BigInt(params.maxPricePerTicket)),
    );

    const account = await sorobanRpcServer.getAccount(userAddress);
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: CONTRACT_CONFIG.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
  }

  // ============================================
  // READ FUNCTIONS
  // ============================================

  /**
   * Get raffle data by ID
   */
  static async getRaffleData(
    raffleId: number,
  ): Promise<ContractResponse<ContractRaffleData>> {
    try {
      console.log(
        `📖 ContractService.getRaffleData: Fetching raffle ${raffleId}`,
      );

      const contract = this.getContract();
      const operation = contract.call(
        CONTRACT_CONFIG.functions.getRaffleData,
        nativeToScVal(raffleId, { type: "u32" }),
      );

      // For read operations, we can simulate without signing
      const account = new Account(
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0",
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: CONTRACT_CONFIG.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const response = await sorobanRpcServer.simulateTransaction(transaction);

      if (rpc.Api.isSimulationError(response)) {
        throw new Error(`Failed to get raffle data: ${response.error}`);
      }

      // Parse the response data - only access result if simulation was successful
      const result = response.result?.retval;
      if (!result) {
        throw new Error("No data returned from contract");
      }

      // Convert XDR result to ContractRaffleData
      // Note: This parsing will depend on the actual contract implementation
      // For now, we'll create a mock structure until the contract is deployed
      const parsedResult = scValToNative(result);

      const raffleData: ContractRaffleData = {
        id: raffleId,
        creator: parsedResult?.creator || "",
        metadataId: parsedResult?.metadataId || "",
        ticketPrice: parsedResult?.ticketPrice?.toString() || "0",
        totalTickets: parsedResult?.totalTickets || 0,
        ticketsSold: parsedResult?.ticketsSold || 0,
        endTime: parsedResult?.endTime || 0,
        isActive: parsedResult?.isActive || false,
        winner: parsedResult?.winner,
        prizeDistributed: parsedResult?.prizeDistributed || false,
      };

      console.log(`✅ ContractService.getRaffleData: Success`, raffleData);

      return {
        success: true,
        data: raffleData,
      };
    } catch (error) {
      const contractError = this.handleError(error, "getRaffleData");
      return {
        success: false,
        error: contractError.message,
      };
    }
  }

  /**
   * Get all active raffle IDs
   */
  static async getActiveRaffleIds(): Promise<ContractResponse<number[]>> {
    try {
      console.log(
        "📖 ContractService.getActiveRaffleIds: Fetching active raffles",
      );

      const contract = this.getContract();
      const operation = contract.call(
        CONTRACT_CONFIG.functions.getActiveRaffleIds,
      );

      const account = new Account(
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0",
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: CONTRACT_CONFIG.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const response = await sorobanRpcServer.simulateTransaction(transaction);

      if (rpc.Api.isSimulationError(response)) {
        throw new Error(`Failed to get active raffles: ${response.error}`);
      }

      const result = response.result?.retval;
      const parsedResult = result ? scValToNative(result) : [];
      const activeIds: number[] = Array.isArray(parsedResult)
        ? parsedResult
        : [];

      console.log(
        `✅ ContractService.getActiveRaffleIds: Found ${activeIds.length} active raffles`,
      );

      return {
        success: true,
        data: activeIds,
      };
    } catch (error) {
      const contractError = this.handleError(error, "getActiveRaffleIds");
      return {
        success: false,
        error: contractError.message,
      };
    }
  }

  /**
   * Get all raffle IDs (active and inactive)
   */
  static async getAllRaffleIds(): Promise<ContractResponse<number[]>> {
    try {
      console.log("📖 ContractService.getAllRaffleIds: Fetching all raffles");

      const contract = this.getContract();
      const operation = contract.call(
        CONTRACT_CONFIG.functions.getAllRaffleIds,
      );

      const account = new Account(
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0",
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: CONTRACT_CONFIG.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const response = await sorobanRpcServer.simulateTransaction(transaction);

      if (rpc.Api.isSimulationError(response)) {
        throw new Error(`Failed to get all raffles: ${response.error}`);
      }

      const result = response.result?.retval;
      const parsedResult = result ? scValToNative(result) : [];
      const allIds: number[] = Array.isArray(parsedResult) ? parsedResult : [];

      console.log(
        `✅ ContractService.getAllRaffleIds: Found ${allIds.length} total raffles`,
      );

      return {
        success: true,
        data: allIds,
      };
    } catch (error) {
      const contractError = this.handleError(error, "getAllRaffleIds");
      return {
        success: false,
        error: contractError.message,
      };
    }
  }

  /**
   * Get user participation data for a specific raffle
   */
  static async getUserParticipation(
    userAddress: string,
    raffleId: number,
  ): Promise<ContractResponse<ContractUserParticipation | null>> {
    try {
      console.log(
        `📖 ContractService.getUserParticipation: User ${userAddress} in raffle ${raffleId}`,
      );

      const contract = this.getContract();
      const operation = contract.call(
        CONTRACT_CONFIG.functions.getUserParticipation,
        nativeToScVal(userAddress, { type: "address" }),
        nativeToScVal(raffleId, { type: "u32" }),
      );

      const account = new Account(
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0",
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: CONTRACT_CONFIG.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const response = await sorobanRpcServer.simulateTransaction(transaction);

      if (rpc.Api.isSimulationError(response)) {
        throw new Error(`Failed to get user participation: ${response.error}`);
      }

      const result = response.result?.retval;

      // If no participation found, return null
      if (!result) {
        return {
          success: true,
          data: null,
        };
      }

      const parsedResult = scValToNative(result);

      // If no participation found, return null
      if (!parsedResult || parsedResult.ticketsPurchased === 0) {
        return {
          success: true,
          data: null,
        };
      }

      const participation: ContractUserParticipation = {
        raffleId,
        userAddress,
        ticketsPurchased: parsedResult.ticketsPurchased || 0,
        totalSpent: parsedResult.totalSpent?.toString() || "0",
        participationTime: parsedResult.participationTime || 0,
      };

      console.log(
        `✅ ContractService.getUserParticipation: Success`,
        participation,
      );

      return {
        success: true,
        data: participation,
      };
    } catch (error) {
      const contractError = this.handleError(error, "getUserParticipation");
      return {
        success: false,
        error: contractError.message,
      };
    }
  }

  // ============================================
  // WRITE FUNCTIONS
  // ============================================

  /**
   * Estimate the network fee for creating a raffle without submitting.
   * Runs Soroban transaction simulation and returns the fee in XLM.
   */
  static async estimateCreate(
    params: Omit<CreateRaffleParams, "metadataId"> & { metadataId?: string },
  ): Promise<ContractResponse<CreateRaffleEstimate>> {
    if (import.meta.env.VITE_TEST_MODE === "true") {
      return {
        success: true,
        data: { xlm: "0.0000100", stroops: "100" },
      };
    }

    try {
      const tx = await ContractService.buildCreateRaffleTx({
        metadataId: params.metadataId ?? "",
        ticketPrice: params.ticketPrice,
        totalTickets: params.totalTickets,
        durationInSeconds: params.durationInSeconds,
      });

      const simResult = await sorobanRpcServer.simulateTransaction(tx);

      if (rpc.Api.isSimulationError(simResult)) {
        throw new Error(simResult.error ?? "Simulation failed");
      }

      const preparedTx = rpc.assembleTransaction(tx, simResult).build();
      const stroops = preparedTx.fee;

      return {
        success: true,
        data: {
          xlm: formatXlm(stroops),
          stroops,
        },
      };
    } catch (error) {
      const contractError = ContractService.handleError(error, "estimateCreate");
      return {
        success: false,
        error: contractError.message,
      };
    }
  }

  /**
   * Create a new raffle.
   * Delegates the full build → estimate → sign → submit → poll pipeline to runPipeline.
   */
  static async createRaffle(
    params: CreateRaffleParams,
    options?: PipelineOptions,
  ): Promise<PipelineResult> {
    if (import.meta.env.VITE_TEST_MODE === "true") {
      console.log("✍️ ContractService.createRaffle (test mode): Mocked success", params);
      options?.onProgress?.({ stage: "BUILD",    status: "done" });
      options?.onProgress?.({ stage: "ESTIMATE", status: "done", estimatedFee: "100" });
      options?.onProgress?.({ stage: "SIGN",     status: "done" });
      options?.onProgress?.({ stage: "SUBMIT",   status: "done", txHash: "TEST123" });
      options?.onProgress?.({ stage: "POLL",     status: "done", confirmations: 1 });
      options?.onProgress?.({ stage: "DONE",     status: "done", txHash: "TEST123" });
      return { ok: true, data: { txHash: "TEST123" } };
    }

    return runPipeline(
      (p) => ContractService.buildCreateRaffleTx(p),
      { params, options },
    );
  }

  /**
   * Buy tickets for a raffle.
   * Delegates the full build → estimate → sign → submit → poll pipeline to runPipeline.
   */
  static async buyTickets(
    params: BuyTicketParams,
    options?: PipelineOptions,
  ): Promise<PipelineResult> {
    return runPipeline(
      (p) => ContractService.buildBuyTicketsTx(p),
      { params, options },
    );
  }

  /**
   * @deprecated Use buyTickets() instead.
   */
  static async buyTicket(params: BuyTicketParams): Promise<ContractResponse<string>> {
    const result = await ContractService.buyTickets(params);
    if (result.ok) {
      return { success: true, data: result.data.txHash, transactionHash: result.data.txHash };
    }
    return { success: false, error: result.error.message };
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Check if contract is properly configured
   */
  static isConfigured(): boolean {
    return CONTRACT_CONFIG.address !== "TBD";
  }

  /**
   * Get contract configuration
   */
  static getConfig() {
    return CONTRACT_CONFIG;
  }

  /**
   * Reset contract instance (useful for testing or config changes)
   */
  static reset(): void {
    this.contract = null;
  }
}

/**
 * Export individual functions for convenience
 */
export const {
  getRaffleData,
  getActiveRaffleIds,
  getAllRaffleIds,
  getUserParticipation,
  createRaffle,
  estimateCreate,
  buyTickets,
  buyTicket,
  buildCreateRaffleTx,
  buildBuyTicketsTx,
  isConfigured,
  getConfig,
} = ContractService;

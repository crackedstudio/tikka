/**
 * Contract Service
 * 
 * Service layer for interacting with the Soroban raffle smart contract.
 * Handles all contract read/write operations with proper error handling.
 */

import {
    Contract,
    rpc,
    TransactionBuilder,
    Account,
    BASE_FEE,
    xdr,
    nativeToScVal,
    scValToNative,
} from "@stellar/stellar-sdk";
import { sorobanRpcServer } from "./rpcService";
import { CONTRACT_CONFIG } from "../config/contract";
import { getAccountAddress, signTransaction } from "./walletService";
import type {
    ContractRaffleData,
    ContractUserParticipation,
    CreateRaffleParams,
    BuyTicketParams,
    ContractResponse,
    ContractError,
} from "../types/types";
import { ContractErrorType } from "../types/types";

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
                throw new Error("Contract address not configured. Please deploy the contract first.");
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

        // Network errors
        if (errorMessage.includes("network") || errorMessage.includes("connection")) {
            return {
                type: ContractErrorType.NETWORK_ERROR,
                message: "Network connection failed. Please check your internet connection.",
                details: errorMessage,
            };
        }

        // Wallet errors
        if (errorMessage.includes("wallet") || errorMessage.includes("sign")) {
            return {
                type: ContractErrorType.WALLET_ERROR,
                message: "Wallet operation failed. Please ensure your wallet is connected.",
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
     * Build and submit a contract transaction
     * TODO: Used by write functions when implemented in future issues
     */
    // @ts-ignore - Keeping for future write function implementation
    private static async submitTransaction(
        operation: xdr.Operation,
        operationName: string
    ): Promise<ContractResponse<string>> {
        try {
            const userAddress = await getAccountAddress();
            if (!userAddress) {
                return {
                    success: false,
                    error: "Wallet not connected",
                };
            }

            // Get account details
            const account = await sorobanRpcServer.getAccount(userAddress);
            
            // Build transaction
            const transaction = new TransactionBuilder(account, {
                fee: BASE_FEE,
                networkPassphrase: CONTRACT_CONFIG.networkPassphrase,
            })
                .addOperation(operation)
                .setTimeout(30)
                .build();

            // Simulate transaction first
            const simulateResponse = await sorobanRpcServer.simulateTransaction(transaction);
            
            if (rpc.Api.isSimulationError(simulateResponse)) {
                throw new Error(`Simulation failed: ${simulateResponse.error}`);
            }

            // Prepare transaction for signing
            const preparedTransaction = rpc.assembleTransaction(
                transaction,
                simulateResponse
            ).build();

            // Sign transaction with wallet
            const signResult = await signTransaction(preparedTransaction);
            if (!signResult.success || !signResult.signedTransaction) {
                throw new Error(signResult.error || "Failed to sign transaction");
            }

            // Submit transaction
            const submitResponse = await sorobanRpcServer.sendTransaction(
                signResult.signedTransaction
            );

            if (submitResponse.status === "ERROR") {
                throw new Error(`Transaction failed: ${submitResponse.errorResult}`);
            }

            console.log(`✅ ContractService.${operationName}: Transaction submitted`, {
                hash: submitResponse.hash,
                status: submitResponse.status,
            });

            return {
                success: true,
                data: submitResponse.hash,
                transactionHash: submitResponse.hash,
            };

        } catch (error) {
            const contractError = this.handleError(error, operationName);
            return {
                success: false,
                error: contractError.message,
            };
        }
    }

    // ============================================
    // READ FUNCTIONS
    // ============================================

    /**
     * Get raffle data by ID
     */
    static async getRaffleData(raffleId: number): Promise<ContractResponse<ContractRaffleData>> {
        try {
            console.log(`📖 ContractService.getRaffleData: Fetching raffle ${raffleId}`);

            const contract = this.getContract();
            const operation = contract.call(
                CONTRACT_CONFIG.functions.getRaffleData,
                nativeToScVal(raffleId, { type: "u32" })
            );

            // For read operations, we can simulate without signing
            const account = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
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
            console.log("📖 ContractService.getActiveRaffleIds: Fetching active raffles");

            const contract = this.getContract();
            const operation = contract.call(CONTRACT_CONFIG.functions.getActiveRaffleIds);

            const account = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
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
            const activeIds: number[] = Array.isArray(parsedResult) ? parsedResult : [];

            console.log(`✅ ContractService.getActiveRaffleIds: Found ${activeIds.length} active raffles`);

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
            const operation = contract.call(CONTRACT_CONFIG.functions.getAllRaffleIds);

            const account = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
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

            console.log(`✅ ContractService.getAllRaffleIds: Found ${allIds.length} total raffles`);

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
        raffleId: number
    ): Promise<ContractResponse<ContractUserParticipation | null>> {
        try {
            console.log(`📖 ContractService.getUserParticipation: User ${userAddress} in raffle ${raffleId}`);

            const contract = this.getContract();
            const operation = contract.call(
                CONTRACT_CONFIG.functions.getUserParticipation,
                nativeToScVal(userAddress, { type: "address" }),
                nativeToScVal(raffleId, { type: "u32" })
            );

            const account = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
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

            console.log(`✅ ContractService.getUserParticipation: Success`, participation);

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
     * Create a new raffle
     * TODO: Implement in future issue - full transaction building, simulation, and submission
     */
    static async createRaffle(params: CreateRaffleParams): Promise<ContractResponse<string>> {
        // Stub implementation for future issue
        console.log("✍️ ContractService.createRaffle: Stub called with params", params);

        return {
            success: false,
            error: "Create raffle functionality not yet implemented - will be completed in future issue",
        };
    }

    /**
     * Buy tickets for a raffle
     * TODO: Implement in future issue - full transaction building, simulation, and submission
     */
    static async buyTicket(params: BuyTicketParams): Promise<ContractResponse<string>> {
        // Stub implementation for future issue
        console.log("✍️ ContractService.buyTicket: Stub called with params", params);

        return {
            success: false,
            error: "Buy ticket functionality not yet implemented - will be completed in future issue",
        };
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
    buyTicket,
    isConfigured,
    getConfig,
} = ContractService;
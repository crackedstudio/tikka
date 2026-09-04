/**
 * sdkClient.ts — client-side wiring for `@tikka/sdk`.
 *
 * Replaces the hand-rolled `contractService.ts` (which managed Soroban
 * transactions directly via `@stellar/stellar-sdk` v14). The SDK's browser-safe
 * light bundle owns all contract mechanics; this module only:
 *
 *   1. Bootstraps the SDK singletons from the client network/contract config.
 *   2. Implements a `WalletAdapter` bridge over the existing wallet kit
 *      (`walletService`) so the SDK can retrieve the account and sign XDR.
 *   3. Maps the client's contract operations onto the SDK services
 *      (`RaffleService`, `TicketService`, `ContractService`) while preserving
 *      the exact result shapes the UI already consumes.
 */

import {
  RpcService,
  HorizonService,
  ContractService as SdkContractService,
  FeeEstimatorService,
  RaffleService,
  TicketService,
  ContractFn,
  WalletAdapter,
  WalletName,
  RaffleStatus,
  stroopsToXlm,
  TikkaSdkError,
  TikkaSdkErrorCode,
  type NetworkConfig as SdkNetworkConfig,
  type SignTransactionResult,
  type WalletCapabilities,
} from "@tikka/sdk";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import type { Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";
import { CONTRACT_CONFIG } from "../config/contract";
import { getAccountAddress, signTransaction } from "./walletService";
import {
  runPipeline,
  sdkErrorToPipelineError,
} from "./transactionPipeline";
import type { PipelineOptions, PipelineResult } from "./transactionPipeline";
import type {
  ContractRaffleData,
  ContractUserParticipation,
  CreateRaffleParams,
  BuyTicketParams,
  ContractResponse,
} from "../types/types";

/** Pre-confirmation fee preview for raffle creation (simulation-based, no submit). */
export interface CreateRaffleEstimate {
  xlm: string;
  stroops: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Wallet adapter bridge ────────────────────────────────────────────────────
// Bridges the SDK WalletAdapter contract onto the legacy wallet kit wrapper so
// the SDK lifecycle can sign without the client re-implementing wallet logic.

export class ClientWalletAdapter extends WalletAdapter {
  readonly name = WalletName.Custom;

  constructor() {
    super({ networkPassphrase: STELLAR_CONFIG.networkPassphrase });
  }

  isAvailable(): boolean {
    return true;
  }

  async getPublicKey(): Promise<string> {
    const address = await getAccountAddress();
    if (!address) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        "Wallet not connected",
      );
    }
    return address;
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    const passphrase = opts?.networkPassphrase ?? STELLAR_CONFIG.networkPassphrase;

    let tx: Transaction | FeeBumpTransaction;
    try {
      tx = TransactionBuilder.fromXDR(xdr, passphrase);
    } catch (err) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        "Failed to decode transaction XDR",
        err,
      );
    }

    const result = await signTransaction(tx);
    if (!result.success || !result.signedTransaction) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        result.error ?? "Wallet failed to sign transaction",
      );
    }

    const signed = result.signedTransaction as
      | string
      | { toXDR(): string };
    const signedXdr = typeof signed === "string" ? signed : signed.toXDR();
    return { signedXdr };
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: false,
      supportsGetNetwork: true,
    };
  }
}

// ─── SDK singletons ────────────────────────────────────────────────────────────

export const sdkWalletAdapter = new ClientWalletAdapter();

const networkConfig: SdkNetworkConfig = {
  network: STELLAR_CONFIG.network as SdkNetworkConfig["network"],
  rpcUrl: STELLAR_CONFIG.rpcUrl,
  horizonUrl: STELLAR_CONFIG.horizonUrl,
  networkPassphrase: STELLAR_CONFIG.networkPassphrase,
};

// The SDK's default resolves the contract ID from env vars and throws when none
// is set, but the client may boot with CONTRACT_CONFIG.address === "TBD" (not
// yet deployed). Construct the SDK with a placeholder in that case so importing
// this module never throws; the friendly "not configured" error is surfaced at
// call time by assertConfigured() below.
const CONTRACT_ID_PLACEHOLDER = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2";
const contractId =
  CONTRACT_CONFIG.address !== "TBD" ? CONTRACT_CONFIG.address : CONTRACT_ID_PLACEHOLDER;

/**
 * Guard matching the legacy `getContract()` behaviour. Contract operations
 * return a friendly error (not a cryptic RPC failure) when the contract is not
 * deployed yet. Call right before any contract interaction.
 */
function assertConfigured(): void {
  if (CONTRACT_CONFIG.address === "TBD") {
    throw new Error(
      "Contract address not configured. Please deploy the contract first.",
    );
  }
}

const rpcService = new RpcService(networkConfig);
const horizonService = new HorizonService(networkConfig);

// The light entry exports a browser-friendly RpcService whose public surface
// (simulateSend/getTransaction/…) matches the transport the SDK services rely
// on at runtime; it just lacks the network RpcService's private members, so it
// isn't structuraly assignable. Cast once so the ctor type-checks.
type SdkRpcTransport = ConstructorParameters<typeof SdkContractService>[0];
const sdkRpcTransport = rpcService as unknown as SdkRpcTransport;

export const sdkContractService = new SdkContractService(
  sdkRpcTransport,
  horizonService,
  networkConfig,
  sdkWalletAdapter,
  contractId,
);

export const sdkFeeEstimator = new FeeEstimatorService(
  sdkRpcTransport,
  horizonService,
  networkConfig,
  sdkWalletAdapter,
  contractId,
);

export const raffleService = new RaffleService(sdkContractService, sdkFeeEstimator);
export const ticketService = new TicketService(sdkContractService);

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Estimate the network fee for creating a raffle without submitting.
 * Delegates to the SDK `RaffleService.estimateCreate` (simulation-based).
 */
export async function estimateCreate(
  params: Omit<CreateRaffleParams, "metadataId"> & { metadataId?: string },
): Promise<ContractResponse<CreateRaffleEstimate>> {
  if (import.meta.env.VITE_TEST_MODE === "true") {
    return {
      success: true,
      data: { xlm: "0.0000100", stroops: "100" },
    };
  }

  try {
    assertConfigured();
    const estimate = await raffleService.estimateCreate({
      ticketPrice: stroopsToXlm(params.ticketPrice),
      maxTickets: params.totalTickets,
      endTime:
        Math.floor(Date.now() / 1000) * 1000 + params.durationInSeconds * 1000,
      allowMultiple: true,
      asset: "XLM",
      metadataCid: params.metadataId ?? "",
    });

    return {
      success: true,
      data: { xlm: estimate.xlm, stroops: estimate.stroops },
    };
  } catch (error) {
    return { success: false, error: messageOf(error) };
  }
}

/**
 * Create a new raffle.
 * Delegates the full build → estimate → sign → submit → poll pipeline to the
 * SDK `ContractService` stage methods (via `runPipeline`), reusing the SDK's
 * canonical `create_raffle` parameter shape.
 */
export async function createRaffle(
  params: CreateRaffleParams,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  if (import.meta.env.VITE_TEST_MODE === "true") {
    console.log(
      "✍️ sdkClient.createRaffle (test mode): Mocked success",
      params,
    );
    options?.onProgress?.({ stage: "BUILD", status: "done" });
    options?.onProgress?.({
      stage: "ESTIMATE",
      status: "done",
      estimatedFee: "100",
    });
    options?.onProgress?.({ stage: "SIGN", status: "done" });
    options?.onProgress?.({
      stage: "SUBMIT",
      status: "done",
      txHash: "TEST123",
    });
    options?.onProgress?.({
      stage: "POLL",
      status: "done",
      confirmations: 1,
    });
    options?.onProgress?.({
      stage: "DONE",
      status: "done",
      txHash: "TEST123",
    });
    return { ok: true, data: { txHash: "TEST123" } };
  }

  assertConfigured();

  const endTimeSec = Math.floor(Date.now() / 1000) + params.durationInSeconds;
  const contractParams = raffleService.buildCreateContractParams({
    ticketPrice: stroopsToXlm(params.ticketPrice),
    maxTickets: params.totalTickets,
    endTime: endTimeSec * 1000, // SDK takes ms, converts to seconds for the contract
    allowMultiple: true,
    asset: "XLM",
    metadataCid: params.metadataId ?? "",
  });

  return runPipeline({
    target: sdkContractService,
    method: ContractFn.CREATE_RAFFLE,
    params: contractParams,
    options,
  });
}

/**
 * Buy tickets for a raffle.
 * Delegates to the SDK `TicketService.buyTickets`, which validates inputs, the
 * raffle state, and duplicate submissions before invoking the contract.
 */
export async function buyTickets(
  params: BuyTicketParams,
  _options?: PipelineOptions,
): Promise<PipelineResult> {
  try {
    assertConfigured();
    const result = await ticketService.buyTickets({
      raffleId: params.raffleId,
      count: params.ticketCount,
      maxPricePerTicket: params.maxPricePerTicket,
    });

    const txHash =
      result.value?.transactionHash ?? result.transactionHash ?? "";

    return { ok: true, data: { txHash } };
  } catch (error) {
    return { ok: false, error: sdkErrorToPipelineError(error) };
  }
}

/**
 * Claim a finalized raffle prize.
 * Delegates to the SDK `TicketService.claimPrize`.
 */
export async function claimPrize(
  params: { raffleId: number },
  _options?: PipelineOptions,
): Promise<PipelineResult> {
  try {
    assertConfigured();
    const result = await ticketService.claimPrize({ raffleId: params.raffleId });

    const txHash =
      result.value?.transactionHash ?? result.transactionHash ?? "";

    if (!txHash) {
      return {
        ok: false,
        error: {
          code: "SUBMISSION_FAILED",
          message: result.error ?? "Prize claim failed",
        },
      };
    }

    return { ok: true, data: { txHash } };
  } catch (error) {
    return { ok: false, error: sdkErrorToPipelineError(error) };
  }
}

/**
 * @deprecated Use buyTickets() instead.
 */
export async function buyTicket(
  params: BuyTicketParams,
): Promise<ContractResponse<string>> {
  const result = await buyTickets(params);
  if (result.ok === true) {
    return {
      success: true,
      data: result.data.txHash,
      transactionHash: result.data.txHash,
    };
  }
  return { success: false, error: result.error.message };
}

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Get raffle data by ID.
 * Read-only contract simulation via the SDK `ContractService.simulateReadOnly`.
 */
export async function getRaffleData(
  raffleId: number,
): Promise<ContractResponse<ContractRaffleData>> {
  try {
    assertConfigured();
    const res = await sdkContractService.simulateReadOnly<any>(
      ContractFn.GET_RAFFLE_DATA,
      [raffleId],
    );

    const raw = res.value ?? {};
    const status = Number(raw.status ?? raw.Status ?? RaffleStatus.Open);

    return {
      success: true,
      data: {
        id: raffleId,
        creator: raw.creator ?? raw.Creator ?? "",
        metadataId: raw.metadata_cid ?? raw.metadataId ?? raw.MetadataId ?? "",
        ticketPrice: String(raw.ticket_price ?? raw.ticketPrice ?? "0"),
        totalTickets: Number(raw.max_tickets ?? raw.totalTickets ?? 0),
        ticketsSold: Number(raw.tickets_sold ?? raw.ticketsSold ?? 0),
        endTime: Number(raw.end_time ?? raw.endTime ?? 0),
        isActive: status === RaffleStatus.Open,
        winner: raw.winner,
        prizeDistributed: Boolean(
          raw.prize_distributed ?? raw.prizeDistributed ?? false,
        ),
      },
    };
  } catch (error) {
    return { success: false, error: messageOf(error) };
  }
}

/** Get all active raffle IDs (read-only). */
export async function getActiveRaffleIds(): Promise<ContractResponse<number[]>> {
  try {
    assertConfigured();
    const res = await raffleService.listActive();
    return {
      success: Boolean(res.success),
      data: res.value ?? [],
      error: res.error,
    };
  } catch (error) {
    return { success: false, error: messageOf(error) };
  }
}

/** Get all raffle IDs, active and inactive (read-only). */
export async function getAllRaffleIds(): Promise<ContractResponse<number[]>> {
  try {
    assertConfigured();
    const res = await raffleService.listAll();
    return {
      success: Boolean(res.success),
      data: res.value ?? [],
      error: res.error,
    };
  } catch (error) {
    return { success: false, error: messageOf(error) };
  }
}

/**
 * Get user participation data for a specific raffle (read-only).
 * Uses the legacy `get_user_raffle_participation` binding, which predates the
 * SDK's global `get_user_participation` helper.
 */
export async function getUserParticipation(
  userAddress: string,
  raffleId: number,
): Promise<ContractResponse<ContractUserParticipation | null>> {
  try {
    assertConfigured();
    const res = await sdkContractService.simulateReadOnly<any>(
      CONTRACT_CONFIG.functions.getUserParticipation,
      [userAddress, raffleId],
    );

    const raw = res.value;
    const ticketsPurchased = Number(
      raw?.tickets ?? raw?.ticketsPurchased ?? 0,
    );

    if (!raw || ticketsPurchased === 0) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        raffleId,
        userAddress,
        ticketsPurchased,
        totalSpent: String(raw.amount_spent ?? raw.totalSpent ?? "0"),
        participationTime: Number(
          raw.participation_time ?? raw.participationTime ?? 0,
        ),
      },
    };
  } catch (error) {
    return { success: false, error: messageOf(error) };
  }
}

// ─── Utility functions ─────────────────────────────────────────────────────────

/** Check if the contract is properly configured. */
export function isConfigured(): boolean {
  return CONTRACT_CONFIG.address !== "TBD";
}

/** Get the raw contract configuration. */
export function getConfig() {
  return CONTRACT_CONFIG;
}

/**
 * Static-style facade preserving the `ContractService.*` call sites of the
 * legacy service (e.g. `useRaffleMutations`), now backed by `@tikka/sdk`.
 */
export const ContractService = {
  estimateCreate,
  createRaffle,
  buyTickets,
  buyTicket,
  claimPrize,
  getRaffleData,
  getActiveRaffleIds,
  getAllRaffleIds,
  getUserParticipation,
  isConfigured,
  getConfig,
};
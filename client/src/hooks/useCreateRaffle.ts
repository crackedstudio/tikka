import { useState } from "react";
import { useWalletContext, useAuthContext } from "../providers";
import { STELLAR_CONFIG } from "../config/stellar";
import { MetadataService } from "../services/metadataService";
import { createRaffle } from "../services/sdkClient";
import type { PipelineProgressEvent } from "../services/transactionPipeline";
import { CreateRaffleFormSchema } from "../utils/raffleValidation";
import { logger } from "../utils/logger";

export interface UseCreateRaffleParams {
  title: string;
  description: string;
  prizeName: string;
  prizeValue: string;
  prizeCurrency: string;
  category: string;
  tags: string[];
  endTime: number;
  maxTickets: number;
  ticketPrice: string;
  imageFile?: File | null;
  onSuccess?: (raffleId: number) => void;
  onError?: (error: string) => void;
}

export type CreateRaffleButtonState =
  | "loading"
  | "connect-wallet"
  | "wrong-network"
  | "sign-in"
  | "ready";

const STAGE_PROGRESS: Record<string, number> = {
  BUILD: 40,
  ESTIMATE: 55,
  SIGN: 70,
  SUBMIT: 85,
  POLL: 92,
  DONE: 100,
};

const STAGE_LABEL: Record<string, string> = {
  BUILD: "Building transaction...",
  ESTIMATE: "Estimating fees...",
  SIGN: "Waiting for wallet signature...",
  SUBMIT: "Submitting to network...",
  POLL: "Waiting for confirmation...",
  DONE: "Raffle created successfully!",
};

const ERROR_MESSAGES: Record<string, string> = {
  USER_REJECTED: "Transaction was cancelled.",
  INSUFFICIENT_FEES: "Insufficient funds to cover fees.",
  TIMEOUT: "Transaction timed out. Check your wallet for status.",
};

export function useCreateRaffle(params: UseCreateRaffleParams) {
  const {
    title,
    description,
    prizeName,
    prizeValue,
    prizeCurrency,
    category,
    tags,
    endTime,
    maxTickets,
    ticketPrice,
    imageFile,
    onSuccess,
    onError,
  } = params;

  const { isConnected, isWrongNetwork, connect, switchNetwork } = useWalletContext();
  const { isAuthenticated } = useAuthContext();
  const isTestMode = import.meta.env.VITE_TEST_MODE === "true";
  const effectiveIsAuthenticated = isTestMode || isAuthenticated;

  const [isLoading, setIsLoading] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [createdRaffleId, setCreatedRaffleId] = useState<number | undefined>(undefined);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  const targetNetwork =
    STELLAR_CONFIG.network.charAt(0).toUpperCase() + STELLAR_CONFIG.network.slice(1);

  const handleCreateRaffle = async () => {
    setIsLoading(true);
    setShowProcessingModal(true);
    setProgress(0);
    setCurrentStep("Preparing raffle data...");

    try {
      if (!imageFile) {
        throw new Error("Prize image is required");
      }

      setCurrentStep("Uploading metadata and image...");
      setProgress(20);

      const metadataCid = await MetadataService.uploadMetadataWithImage(
        {
          title,
          description,
          prizeName,
          prizeValue,
          prizeCurrency,
          category,
          tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        imageFile,
      );

      const durationInSeconds = endTime - Math.floor(Date.now() / 1000);

      const formValidation = CreateRaffleFormSchema.safeParse({
        ticketPrice,
        totalTickets: maxTickets,
        durationInSeconds: Math.max(0, durationInSeconds),
      });

      if (!formValidation.success) {
        throw new Error(formValidation.error.issues.map((e) => e.message).join("; "));
      }

      const handleProgress = (event: PipelineProgressEvent) => {
        if (event.status === "error") return;
        setCurrentStep(STAGE_LABEL[event.stage] ?? event.stage);
        setProgress((prev) => STAGE_PROGRESS[event.stage] ?? prev);
      };

      const result = await createRaffle(
        {
          metadataId: metadataCid,
          ticketPrice,
          totalTickets: maxTickets,
          durationInSeconds: Math.max(0, durationInSeconds),
        },
        { onProgress: handleProgress },
      );

      if (!result.ok) {
        throw new Error(ERROR_MESSAGES[result.error.code] ?? result.error.message);
      }

      const raffleId = Math.floor(1000 + Math.random() * 9000);
      setCreatedRaffleId(raffleId);
      setTxHash(result.data.txHash);
      onSuccess?.(raffleId);

      setTimeout(() => {
        setShowProcessingModal(false);
        setShowSuccessModal(true);
        setIsLoading(false);
      }, 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create raffle";
      logger.error("Error creating raffle:", err);
      setCurrentStep(message);
      setProgress(0);
      onError?.(message);
      setTimeout(() => {
        setShowProcessingModal(false);
        setIsLoading(false);
      }, 2500);
    }
  };

  const handleButtonClick = async () => {
    if (!isConnected) {
      await connect();
      return;
    }
    if (isWrongNetwork) {
      await switchNetwork();
      return;
    }
    if (!effectiveIsAuthenticated) {
      onError?.("Please sign in before creating a raffle.");
      return;
    }
    handleCreateRaffle();
  };

  const buttonState: CreateRaffleButtonState = isLoading
    ? "loading"
    : !isConnected
      ? "connect-wallet"
      : isWrongNetwork
        ? "wrong-network"
        : !effectiveIsAuthenticated
          ? "sign-in"
          : "ready";

  return {
    buttonState,
    targetNetwork,
    isLoading,
    showProcessingModal,
    showSuccessModal,
    currentStep,
    progress,
    createdRaffleId,
    txHash,
    handleButtonClick,
    closeProcessingModal: () => {
      if (!isLoading) setShowProcessingModal(false);
    },
    closeSuccessModal: () => setShowSuccessModal(false),
  };
}
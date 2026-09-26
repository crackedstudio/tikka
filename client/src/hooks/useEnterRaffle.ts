import { useState } from "react";
import { useWalletContext } from "../providers";
import { STELLAR_CONFIG } from "../config/stellar";
import { useBuyTicketsMutation } from "./useRaffleMutations";

const ERROR_MESSAGES: Record<string, string> = {
  USER_REJECTED: "Transaction was cancelled.",
  INSUFFICIENT_FEES: "Insufficient funds to cover fees.",
  TIMEOUT: "Transaction timed out. Check your wallet for status.",
  SIGNING_FAILED: "Failed to sign transaction.",
  SUBMISSION_FAILED: "Failed to submit transaction.",
  FINALITY_FAILED: "Transaction failed on-chain.",
};

export type EnterRaffleButtonState = "loading" | "connect-wallet" | "wrong-network" | "ready";

export interface UseEnterRaffleParams {
  raffleId: number;
  ticketPrice: string;
  ticketCount?: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function useEnterRaffle({
  raffleId,
  ticketPrice,
  ticketCount = 1,
  onSuccess,
  onError,
}: UseEnterRaffleParams) {
  const { isConnected, isWrongNetwork, connect, switchNetwork } = useWalletContext();
  const { mutateAsync: buyTicketsMutation } = useBuyTicketsMutation();

  const [isLoading, setIsLoading] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [currentStep, setCurrentStep] = useState("");

  const targetNetwork =
    STELLAR_CONFIG.network.charAt(0).toUpperCase() + STELLAR_CONFIG.network.slice(1);

  const handleEnterRaffle = async () => {
    setIsLoading(true);
    setShowProcessingModal(true);
    setCurrentStep("Building transaction...");

    const result = await buyTicketsMutation({
      raffleId,
      ticketCount,
      maxPricePerTicket: ticketPrice,
    });

    setShowProcessingModal(false);

    if (result.ok) {
      setShowSuccessModal(true);
      onSuccess?.();
    } else {
      onError?.(ERROR_MESSAGES[result.error.code] ?? result.error.message);
      setShowFailedModal(true);
    }
    setIsLoading(false);
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
    handleEnterRaffle();
  };

  const buttonState: EnterRaffleButtonState = isLoading
    ? "loading"
    : !isConnected
      ? "connect-wallet"
      : isWrongNetwork
        ? "wrong-network"
        : "ready";

  return {
    buttonState,
    targetNetwork,
    isLoading,
    showProcessingModal,
    showSuccessModal,
    showFailedModal,
    currentStep,
    handleButtonClick,
    handleEnterRaffle,
    closeProcessingModal: () => {
      if (!isLoading) setShowProcessingModal(false);
    },
    closeSuccessModal: () => setShowSuccessModal(false),
    closeFailedModal: () => setShowFailedModal(false),
  };
}
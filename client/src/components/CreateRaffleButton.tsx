import React, { useState } from "react";
import Modal from "./modals/Modal";
import ProcessingRaffleCreation from "./modals/ProcessingRaffleCreation";
import RaffleCreatedSuccess from "./modals/RaffleCreatedSuccess";
import { useWalletContext } from "../providers";
import { STELLAR_CONFIG } from "../config/stellar";
import { MetadataService } from "../services/metadataService";
import { createRaffle } from "../services/contractService";
import { useAuthContext } from "../providers";
import type { PipelineProgressEvent } from "../services/transactionPipeline";

interface CreateRaffleButtonProps {
  // Form data for metadata
  title: string;
  description: string;
  image: string;
  imageFile?: File | null;
  prizeName: string;
  prizeValue: string;
  prizeCurrency: string;
  category: string;
  tags: string[];

  // Contract parameters
  endTime: number; // Unix timestamp
  maxTickets: number;
  allowMultipleTickets: boolean;
  ticketPrice: string; // In wei
  ticketToken?: string; // Token address, undefined for ETH

  onSuccess?: (raffleId: number) => void;
  onError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
}

const CreateRaffleButton = ({
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
  className = "bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 dark:text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200",
  children = "Publish Raffle",
}: CreateRaffleButtonProps) => {
  const { isConnected, isWrongNetwork, connect, switchNetwork } =
    useWalletContext();
  const { isAuthenticated } = useAuthContext();
  const isTestMode = import.meta.env.VITE_TEST_MODE === "true";
  const effectiveIsAuthenticated = isTestMode || isAuthenticated;
  const [isLoading, setIsLoading] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [createdRaffleId, setCreatedRaffleId] = useState<number | undefined>(
    undefined,
  );
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  const targetNetwork =
    STELLAR_CONFIG.network.charAt(0).toUpperCase() +
    STELLAR_CONFIG.network.slice(1);

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

      // Stage → progress mapping for the modal
      const stageProgress: Record<string, number> = {
        BUILD: 40,
        ESTIMATE: 55,
        SIGN: 70,
        SUBMIT: 85,
        POLL: 92,
        DONE: 100,
      };

      const stageLabel: Record<string, string> = {
        BUILD: "Building transaction...",
        ESTIMATE: "Estimating fees...",
        SIGN: "Waiting for wallet signature...",
        SUBMIT: "Submitting to network...",
        POLL: "Waiting for confirmation...",
        DONE: "Raffle created successfully!",
      };

      const handleProgress = (event: PipelineProgressEvent) => {
        if (event.status === "error") return; // error state handled by result union
        setCurrentStep(stageLabel[event.stage] ?? event.stage);
        setProgress(stageProgress[event.stage] ?? progress);
      };

      const result = await createRaffle(
        {
          metadataId: metadataCid,
          ticketPrice: ticketPrice,
          totalTickets: maxTickets,
          durationInSeconds: Math.max(0, durationInSeconds),
        },
        { onProgress: handleProgress },
      );

      if (!result.ok) {
        const errorMessages: Record<string, string> = {
          USER_REJECTED: "Transaction was cancelled.",
          INSUFFICIENT_FEES: "Insufficient funds to cover fees.",
          TIMEOUT: "Transaction timed out. Check your wallet for status.",
        };
        throw new Error(errorMessages[result.error.code] ?? result.error.message);
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
      console.error("Error creating raffle:", err);
      setCurrentStep(message);
      setProgress(0);
      onError?.(message);
      setTimeout(() => {
        setShowProcessingModal(false);
        setIsLoading(false);
      }, 2500);
    }
  };

  const getButtonText = () => {
    if (isLoading) return "Creating...";
    if (!isConnected) return "Connect Wallet to Publish";
    if (isWrongNetwork) return `Switch to ${targetNetwork}`;
    if (!effectiveIsAuthenticated) return "Sign in to Publish";
    return children;
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={isLoading}
        className={`${className} ${
          isLoading ? "opacity-50 cursor-not-allowed" : ""
        } ${(!isConnected || isWrongNetwork) && !isLoading ? "bg-indigo-600! hover:bg-indigo-700!" : ""}`}
      >
        {getButtonText()}
      </button>

      {/* Processing Modal */}
      <Modal
        open={showProcessingModal}
        onClose={() => {
          if (!isLoading) {
            setShowProcessingModal(false);
          }
        }}
      >
        <ProcessingRaffleCreation
          isVisible={showProcessingModal}
          currentStep={currentStep}
          progress={progress}
          network={STELLAR_CONFIG.network}
          onClose={() => {
            if (!isLoading) {
              setShowProcessingModal(false);
            }
          }}
        />
      </Modal>

      {/* Success Modal */}
      <Modal
        open={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
        }}
      >
        <RaffleCreatedSuccess
          isVisible={showSuccessModal}
          raffleId={createdRaffleId}
          transactionHash={txHash}
          network={STELLAR_CONFIG.network}
          onClose={() => {
            setShowSuccessModal(false);
          }}
        />{" "}
      </Modal>
    </>
  );
};

export default CreateRaffleButton;

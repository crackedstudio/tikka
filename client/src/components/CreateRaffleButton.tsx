import React, { useState } from "react";
import Modal from "./modals/Modal";
import ProcessingRaffleCreation from "./modals/ProcessingRaffleCreation";
import RaffleCreatedSuccess from "./modals/RaffleCreatedSuccess";
import { useWalletContext } from "../providers/WalletProvider";
import { STELLAR_CONFIG } from "../config/stellar";
import { MetadataService } from "../services/metadataService";
import { createRaffle } from "../services/contractService";
import { useAuthContext } from "../providers/AuthProvider";

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
      // 1. Upload metadata and image to backend
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

      // 2. Create raffle on-chain
      setCurrentStep("Creating raffle on-chain...");
      setProgress(50);

      const durationInSeconds = endTime - Math.floor(Date.now() / 1000);

      const result = await createRaffle({
        metadataId: metadataCid,
        ticketPrice: ticketPrice, // It's already in stroops from ReviewStep
        totalTickets: maxTickets,
        durationInSeconds: Math.max(0, durationInSeconds),
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to create raffle on-chain");
      }

      setCurrentStep("Raffle created successfully!");
      setProgress(100);

      // TODO: In a real scenario, the raffle ID would come from the contract event
      // For now, we might need to wait for the indexer or use a temp ID if not returned immediately
      const raffleId = result.data
        ? parseInt(result.data)
        : Math.floor(1000 + Math.random() * 9000);
      setCreatedRaffleId(raffleId);
      setTxHash(result.transactionHash);
      onSuccess?.(raffleId);

      setTimeout(() => {
        setShowProcessingModal(false);
        setShowSuccessModal(true);
        setIsLoading(false);
      }, 1200);
    } catch (err: any) {
      console.error("Error creating raffle:", err);
      setCurrentStep(err.message || "Error occurred during raffle creation");
      setProgress(0);
      onError?.(err instanceof Error ? err.message : "Failed to create raffle");
      setTimeout(() => {
        setShowProcessingModal(false);
        setIsLoading(false);
      }, 2500); // Give user time to read error
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

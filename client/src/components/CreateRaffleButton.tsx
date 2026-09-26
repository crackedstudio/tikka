import React from "react";
import Modal from "./modals/Modal";
import ProcessingRaffleCreation from "./modals/ProcessingRaffleCreation";
import RaffleCreatedSuccess from "./modals/RaffleCreatedSuccess";
import { STELLAR_CONFIG } from "../config/stellar";
import { useCreateRaffle } from "../hooks/useCreateRaffle";

interface CreateRaffleButtonProps {
  title: string;
  description: string;
  image: string;
  imageFile?: File | null;
  prizeName: string;
  prizeValue: string;
  prizeCurrency: string;
  category: string;
  tags: string[];
  endTime: number;
  maxTickets: number;
  allowMultipleTickets: boolean;
  ticketPrice: string;
  ticketToken?: string;
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
  const {
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
    closeProcessingModal,
    closeSuccessModal,
  } = useCreateRaffle({
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
  });

  const buttonText = {
    loading: "Creating...",
    "connect-wallet": "Connect Wallet to Publish",
    "wrong-network": `Switch to ${targetNetwork}`,
    "sign-in": "Sign in to Publish",
    ready: children,
  }[buttonState];

  const needsAttentionStyle = buttonState === "connect-wallet" || buttonState === "wrong-network";

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={isLoading}
        className={`${className} ${isLoading ? "opacity-50 cursor-not-allowed" : ""} ${
          needsAttentionStyle && !isLoading ? "bg-indigo-600! hover:bg-indigo-700!" : ""
        }`}
      >
        {buttonText}
      </button>

      <Modal open={showProcessingModal} onClose={closeProcessingModal}>
        <ProcessingRaffleCreation
          isVisible={showProcessingModal}
          currentStep={currentStep}
          progress={progress}
          network={STELLAR_CONFIG.network}
          onClose={closeProcessingModal}
        />
      </Modal>

      <Modal open={showSuccessModal} onClose={closeSuccessModal}>
        <RaffleCreatedSuccess
          isVisible={showSuccessModal}
          raffleId={createdRaffleId}
          transactionHash={txHash}
          network={STELLAR_CONFIG.network}
          onClose={closeSuccessModal}
        />
      </Modal>
    </>
  );
};

export default CreateRaffleButton;
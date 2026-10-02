import React from "react";
import { STELLAR_CONFIG } from "../config/stellar";
import { useEnterRaffle } from "../hooks/useEnterRaffle";
import Modal from "./modals/Modal";
import ProcessingTickets from "./modals/ProcessingTickets";
import SuccessfulTicket from "./modals/SuccessfulTicket";
import FailedTicket from "./modals/FailedTicket";

interface EnterRaffleButtonProps {
  raffleId: number;
  ticketPrice: string;
  ticketCount?: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
}

const EnterRaffleButton = ({
  raffleId,
  ticketPrice,
  ticketCount = 1,
  onSuccess,
  onError,
  className = "border border-pink-500 dark:border-[#fe3796] px-8 py-4 rounded-xl hover:bg-[#fe3796]/10 transition",
  children = "Enter Raffle",
}: EnterRaffleButtonProps) => {
  const {
    buttonState,
    targetNetwork,
    isLoading,
    showProcessingModal,
    showSuccessModal,
    showFailedModal,
    currentStep,
    handleButtonClick,
    handleEnterRaffle,
    closeProcessingModal,
    closeSuccessModal,
    closeFailedModal,
  } = useEnterRaffle({ raffleId, ticketPrice, ticketCount, onSuccess, onError });

  const buttonText = {
    loading: "Processing...",
    "connect-wallet": "Connect Wallet",
    "wrong-network": `Switch to ${targetNetwork}`,
    ready: children,
  }[buttonState];

  const needsAttentionStyle = buttonState === "connect-wallet" || buttonState === "wrong-network";

  return (
    <>
      <button
        data-testid="enter-raffle-btn"
        onClick={handleButtonClick}
        disabled={isLoading}
        className={`${className} ${isLoading ? "opacity-50 cursor-not-allowed" : ""} ${
          needsAttentionStyle && !isLoading
            ? "!bg-indigo-600 !text-gray-900 dark:text-white !border-indigo-600 hover:!bg-indigo-700"
            : ""
        }`}
      >
        {buttonText}
      </button>

      <Modal open={showProcessingModal} onClose={closeProcessingModal}>
        <ProcessingTickets
          isVisible={showProcessingModal}
          network={STELLAR_CONFIG.network}
          onClose={closeProcessingModal}
        />
      </Modal>

      <Modal open={showSuccessModal} onClose={closeSuccessModal}>
        <SuccessfulTicket
          isVisible={showSuccessModal}
          onClose={closeSuccessModal}
          onContinue={closeSuccessModal}
        />
      </Modal>

      <Modal open={showFailedModal} onClose={closeFailedModal}>
        <FailedTicket
          isVisible={showFailedModal}
          onClose={closeFailedModal}
          onContinue={() => {
            closeFailedModal();
            handleEnterRaffle();
          }}
        />
      </Modal>

      <div aria-live="polite" className="sr-only">
        {currentStep}
      </div>
    </>
  );
};

export default EnterRaffleButton;
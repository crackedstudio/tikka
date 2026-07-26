import React, { useState } from "react";
import { useWalletContext } from "../providers";
import { STELLAR_CONFIG } from "../config/stellar";
import { useBuyTicketsMutation } from "../hooks/useRaffleMutations";
import Modal from "./modals/Modal";
import ProcessingTickets from "./modals/ProcessingTickets";
import SuccessfulTicket from "./modals/SuccessfulTicket";
import FailedTicket from "./modals/FailedTicket";
import type { PipelineProgressEvent } from "../services/transactionPipeline";

interface EnterRaffleButtonProps {
    raffleId: number;
    ticketPrice: string;
    ticketCount?: number;
    onSuccess?: () => void;
    onError?: (error: string) => void;
    className?: string;
    children?: React.ReactNode;
}

const ERROR_MESSAGES: Record<string, string> = {
    USER_REJECTED: "Transaction was cancelled.",
    INSUFFICIENT_FEES: "Insufficient funds to cover fees.",
    TIMEOUT: "Transaction timed out. Check your wallet for status.",
    SIGNING_FAILED: "Failed to sign transaction.",
    SUBMISSION_FAILED: "Failed to submit transaction.",
    FINALITY_FAILED: "Transaction failed on-chain.",
};

const STAGE_LABEL: Record<string, string> = {
    BUILD: "Building transaction...",
    ESTIMATE: "Estimating fees...",
    SIGN: "Waiting for wallet signature...",
    SUBMIT: "Submitting to network...",
    POLL: "Waiting for confirmation...",
    DONE: "Tickets purchased!",
};

const EnterRaffleButton = ({
    raffleId,
    ticketPrice,
    ticketCount = 1,
    onSuccess,
    onError,
    className = "border border-pink-500 dark:border-[#fe3796] px-8 py-4 rounded-xl hover:bg-[#fe3796]/10 transition",
    children = "Enter Raffle",
}: EnterRaffleButtonProps) => {
    const { isConnected, isWrongNetwork, connect, switchNetwork } = useWalletContext();
    const [isLoading, setIsLoading] = useState(false);
    const [showProcessingModal, setShowProcessingModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showFailedModal, setShowFailedModal] = useState(false);
    const [currentStep, setCurrentStep] = useState("");

    const targetNetwork = STELLAR_CONFIG.network.charAt(0).toUpperCase() + STELLAR_CONFIG.network.slice(1);

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

    const { mutateAsync: buyTicketsMutation } = useBuyTicketsMutation();

    const handleEnterRaffle = async () => {
        setIsLoading(true);
        setShowProcessingModal(true);
        setCurrentStep("Building transaction...");

        const handleProgress = (event: PipelineProgressEvent) => {
            if (event.status === "error") return;
            setCurrentStep(STAGE_LABEL[event.stage] ?? event.stage);
        };

        const result = await buyTicketsMutation({ 
            raffleId, 
            ticketCount, 
            maxPricePerTicket: ticketPrice 
        }, { 
            onProgress: handleProgress 
        });

        setShowProcessingModal(false);

        if (result.ok) {
            setShowSuccessModal(true);
            onSuccess?.();
        } else {
            const msg = ERROR_MESSAGES[result.error.code] ?? result.error.message;
            setShowFailedModal(true);
            onError?.(msg);
        }

        setIsLoading(false);
    };

    const getButtonText = () => {
        if (isLoading) return "Processing...";
        if (!isConnected) return "Connect Wallet";
        if (isWrongNetwork) return `Switch to ${targetNetwork}`;
        return children;
    };

    return (
        <>
            <button
                data-testid="enter-raffle-btn"
                onClick={handleButtonClick}
                disabled={isLoading}
                className={`${className} ${isLoading ? "opacity-50 cursor-not-allowed" : ""} ${(!isConnected || isWrongNetwork) && !isLoading
                        ? "!bg-indigo-600 !text-gray-900 dark:text-white !border-indigo-600 hover:!bg-indigo-700"
                        : ""
                    }`}
            >
                {getButtonText()}
            </button>

            <Modal open={showProcessingModal} onClose={() => { if (!isLoading) setShowProcessingModal(false); }}>
                <ProcessingTickets
                    isVisible={showProcessingModal}
                    network={STELLAR_CONFIG.network}
                    onClose={() => { if (!isLoading) setShowProcessingModal(false); }}
                />
            </Modal>

            <Modal open={showSuccessModal} onClose={() => setShowSuccessModal(false)}>
                <SuccessfulTicket
                    isVisible={showSuccessModal}
                    onClose={() => setShowSuccessModal(false)}
                    onContinue={() => setShowSuccessModal(false)}
                />
            </Modal>

            <Modal open={showFailedModal} onClose={() => setShowFailedModal(false)}>
                <FailedTicket
                    isVisible={showFailedModal}
                    onClose={() => setShowFailedModal(false)}
                    onContinue={() => { setShowFailedModal(false); handleEnterRaffle(); }}
                />
            </Modal>

            {/* Accessible live region for screen readers */}
            <div aria-live="polite" className="sr-only">{currentStep}</div>
        </>
    );
};

export default EnterRaffleButton;

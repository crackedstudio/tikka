import React, { useState } from "react";
import Modal from "./modals/Modal";
import ProcessingRaffleCreation from "./modals/ProcessingRaffleCreation";
import RaffleCreatedSuccess from "./modals/RaffleCreatedSuccess";

interface CreateRaffleButtonProps {
    // Form data for metadata
    title: string;
    description: string;
    image: string;
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

const CreateRaffleButton: React.FC<CreateRaffleButtonProps> = ({
    title,
    description,
    image,
    prizeName,
    prizeValue,
    prizeCurrency,
    category,
    tags,
    endTime,
    maxTickets,
    allowMultipleTickets,
    ticketPrice,
    ticketToken,
    onSuccess,
    onError,
    className = "bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200",
    children = "Publish Raffle",
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [showProcessingModal, setShowProcessingModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [currentStep, setCurrentStep] = useState("");
    const [progress, setProgress] = useState(0);
    const [createdRaffleId, setCreatedRaffleId] = useState<number | undefined>(
        undefined
    );

    const handleCreateRaffle = async () => {
        setIsLoading(true);
        setShowProcessingModal(true);
        setProgress(0);
        setCurrentStep("Preparing raffle data...");

        try {
            await new Promise((resolve) => setTimeout(resolve, 600));
            setCurrentStep("Saving raffle details...");
            setProgress(45);

            await new Promise((resolve) => setTimeout(resolve, 700));
            setCurrentStep("Finalizing demo raffle...");
            setProgress(85);

            await new Promise((resolve) => setTimeout(resolve, 500));
            setCurrentStep("Raffle created successfully!");
            setProgress(100);

            const raffleId = Math.floor(1000 + Math.random() * 9000);
            setCreatedRaffleId(raffleId);
            onSuccess?.(raffleId);

            setTimeout(() => {
                setShowProcessingModal(false);
                setShowSuccessModal(true);
                setIsLoading(false);
            }, 1200);
        } catch (err: any) {
            console.error("Error creating raffle:", err);
            setCurrentStep("Error occurred during raffle creation");
            setProgress(0);
            onError?.(
                err instanceof Error ? err.message : "Failed to create raffle"
            );
            setTimeout(() => {
                setShowProcessingModal(false);
                setIsLoading(false);
            }, 1200);
        }
    };

    return (
        <>
            <button
                onClick={handleCreateRaffle}
                disabled={isLoading}
                className={`${className} ${
                    isLoading ? "opacity-50 cursor-not-allowed" : ""
                }`}
            >
                {isLoading ? "Creating..." : children}
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
                    network="Demo Mode"
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
                    network="Demo Mode"
                    onClose={() => {
                        setShowSuccessModal(false);
                    }}
                />
            </Modal>
        </>
    );
};

export default CreateRaffleButton;

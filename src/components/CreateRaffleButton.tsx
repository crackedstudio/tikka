import React, { useState } from "react";
import { useAccount } from "wagmi";
import { useRaffleContract } from "../hooks/useRaffleContract";
import {
    RAFFLE_CONTRACT_ADDRESS,
    RAFFLE_CONTRACT_ABI,
} from "../config/contract";
import { MetadataService } from "../services/metadataService";
import type { RaffleMetadata } from "../types/types";
import Modal from "./modals/Modal";
import ProcessingRaffleCreation from "./modals/ProcessingRaffleCreation";

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
    const { address, isConnected } = useAccount();
    const { writeContract, isPending, hash } = useRaffleContract();
    const [isLoading, setIsLoading] = useState(false);
    const [showProcessingModal, setShowProcessingModal] = useState(false);
    const [currentStep, setCurrentStep] = useState("");
    const [progress, setProgress] = useState(0);

    const handleCreateRaffle = async () => {
        console.log("🚀 Starting raffle creation process...");

        if (!isConnected) {
            console.error("❌ Wallet not connected");
            onError?.("Please connect your wallet first");
            return;
        }

        if (!address) {
            console.error("❌ Wallet address not found");
            onError?.("Wallet address not found");
            return;
        }

        console.log("✅ Wallet connected:", address);
        setIsLoading(true);
        setShowProcessingModal(true);
        setProgress(0);
        setCurrentStep("Preparing raffle data...");

        try {
            // Step 1: Upload metadata to Supabase
            const metadata: RaffleMetadata = {
                title,
                description,
                image,
                prizeName,
                prizeValue,
                prizeCurrency,
                category,
                tags,
                createdBy: address,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            setCurrentStep("Uploading metadata to Supabase...");
            setProgress(25);
            console.log("📤 Uploading metadata to Supabase...");
            const recordId = await MetadataService.uploadRaffleMetadata(
                metadata
            );
            console.log("✅ Metadata uploaded with ID:", recordId);

            // Step 2: Create Supabase URL for the metadata
            const metadataUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${
                import.meta.env.VITE_SUPABASE_TABLE || "raffle_metadata"
            }?id=eq.${recordId}`;
            console.log("🔗 Metadata URL:", metadataUrl);

            // Step 3: Create raffle on contract with metadata URL as description
            setCurrentStep("Creating raffle on blockchain...");
            setProgress(50);
            console.log("📝 Calling contract to create raffle...");
            await writeContract({
                address: RAFFLE_CONTRACT_ADDRESS,
                abi: RAFFLE_CONTRACT_ABI,
                functionName: "createRaffle",
                args: [
                    metadataUrl, // Use metadata URL as description
                    BigInt(endTime),
                    BigInt(maxTickets),
                    allowMultipleTickets,
                    BigInt(ticketPrice),
                    (ticketToken as `0x${string}`) ||
                        "0x0000000000000000000000000000000000000000",
                ],
            });
            console.log("✅ Contract call successful!");

            setCurrentStep("Waiting for transaction confirmation...");
            setProgress(75);

            // Wait a bit for the transaction to be processed
            await new Promise((resolve) => setTimeout(resolve, 2000));

            setCurrentStep("Raffle created successfully!");
            setProgress(100);

            // Note: We can't get the raffle ID directly from the transaction
            // We would need to listen to the RaffleCreated event
            onSuccess?.(0); // Placeholder ID

            // Close modal after a short delay
            setTimeout(() => {
                setShowProcessingModal(false);
                setIsLoading(false);
            }, 1500);
        } catch (err: any) {
            console.error("Error creating raffle:", err);
            setCurrentStep("Error occurred during raffle creation");
            setProgress(0);
            onError?.(
                err instanceof Error ? err.message : "Failed to create raffle"
            );
            // Close modal on error
            setTimeout(() => {
                setShowProcessingModal(false);
                setIsLoading(false);
            }, 2000);
        }
    };

    if (!isConnected) {
        return (
            <button
                onClick={() => {
                    onError?.("Please connect your wallet first");
                }}
                className={className}
            >
                Connect Wallet
            </button>
        );
    }

    return (
        <>
            <button
                onClick={handleCreateRaffle}
                disabled={isPending || isLoading}
                className={`${className} ${
                    isPending || isLoading
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                }`}
            >
                {isPending || isLoading ? "Creating..." : children}
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
                    transactionHash={hash}
                    network="Base Sepolia"
                    onClose={() => {
                        if (!isLoading) {
                            setShowProcessingModal(false);
                        }
                    }}
                />
            </Modal>
        </>
    );
};

export default CreateRaffleButton;

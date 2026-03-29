import React, { useState } from "react";
import { useWalletContext } from "../providers/WalletProvider";
import { STELLAR_CONFIG } from "../config/stellar";

interface EnterRaffleButtonProps {
    raffleId: number;
    ticketPrice: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
    className?: string;
    children?: React.ReactNode;
}

const EnterRaffleButton = ({
    raffleId,
    ticketPrice,
    onSuccess,
    onError,
    className = "border border-[#fe3796] px-8 py-4 rounded-xl hover:bg-[#fe3796]/10 transition",
    children = "Enter Raffle",
}: EnterRaffleButtonProps) => {
    const { isConnected, isWrongNetwork, connect, switchNetwork } = useWalletContext();
    const [isLoading, setIsLoading] = useState(false);

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

    const handleEnterRaffle = async () => {
        setIsLoading(true);

        try {
            // Demo entry logic
            await new Promise((resolve) => setTimeout(resolve, 900));
            console.log("🎟️ Demo entry:", { raffleId, ticketPrice });
            onSuccess?.();
        } catch (err: any) {
            console.error("Error buying ticket:", err);
            onError?.(
                err instanceof Error ? err.message : "Failed to buy ticket"
            );
        } finally {
            setIsLoading(false);
        }
    };

    const getButtonText = () => {
        if (isLoading) return "Processing...";
        if (!isConnected) return "Connect Wallet";
        if (isWrongNetwork) return `Switch to ${targetNetwork}`;
        return children;
    };

    return (
        <button
            onClick={handleButtonClick}
            disabled={isLoading}
            className={`${className} ${isLoading ? "opacity-50 cursor-not-allowed" : ""
                } ${(!isConnected || isWrongNetwork) && !isLoading ? "!bg-indigo-600 !text-white !border-indigo-600 hover:!bg-indigo-700" : ""}`}
        >
            {getButtonText()}
        </button>
    );
};

export default EnterRaffleButton;

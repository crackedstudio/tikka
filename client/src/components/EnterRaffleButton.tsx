import React, { useState } from "react";

interface EnterRaffleButtonProps {
    raffleId: number;
    ticketPrice: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
    className?: string;
    children?: React.ReactNode;
}

const EnterRaffleButton: React.FC<EnterRaffleButtonProps> = ({
    raffleId,
    ticketPrice,
    onSuccess,
    onError,
    className = "border border-[#fe3796] px-8 py-4 rounded-xl hover:bg-[#fe3796]/10 transition",
    children = "Enter Raffle",
}) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleEnterRaffle = async () => {
        setIsLoading(true);

        try {
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

    return (
        <button
            onClick={handleEnterRaffle}
            disabled={isLoading}
            className={`${className} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
            }`}
        >
            {isLoading ? "Processing..." : children}
        </button>
    );
};

export default EnterRaffleButton;

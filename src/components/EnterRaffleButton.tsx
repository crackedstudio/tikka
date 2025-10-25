import React, { useState } from "react";
import { useAccount } from "wagmi";
import { useRaffleContract } from "../hooks/useRaffleContract";
import {
    RAFFLE_CONTRACT_ADDRESS,
    RAFFLE_CONTRACT_ABI,
} from "../config/contract";

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
    const { address, isConnected } = useAccount();
    const { writeContract, isPending } = useRaffleContract();
    const [isLoading, setIsLoading] = useState(false);

    const handleEnterRaffle = async () => {
        if (!isConnected) {
            onError?.("Please connect your wallet first");
            return;
        }

        if (!address) {
            onError?.("Wallet address not found");
            return;
        }

        setIsLoading(true);

        try {
            // Convert ETH to wei (1 ETH = 10^18 wei)
            const ethAmount = parseFloat(
                ticketPrice.toString().replace(" ETH", "")
            );
            const weiAmount = BigInt(Math.floor(ethAmount * 1e18));

            console.log("🔍 EnterRaffleButton - Converting ETH to wei:", {
                originalPrice: ticketPrice,
                ethAmount,
                weiAmount: weiAmount.toString(),
            });

            await writeContract({
                address: RAFFLE_CONTRACT_ADDRESS,
                abi: RAFFLE_CONTRACT_ABI,
                functionName: "buyTicket",
                args: [BigInt(raffleId)],
                value: weiAmount,
            });

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

    if (!isConnected) {
        return (
            <button
                onClick={() => {
                    // This will trigger wallet connection
                    onError?.("Please connect your wallet first");
                }}
                className={className}
            >
                Connect Wallet
            </button>
        );
    }

    return (
        <button
            onClick={handleEnterRaffle}
            disabled={isPending || isLoading}
            className={`${className} ${
                isPending || isLoading ? "opacity-50 cursor-not-allowed" : ""
            }`}
        >
            {isPending || isLoading ? "Processing..." : children}
        </button>
    );
};

export default EnterRaffleButton;

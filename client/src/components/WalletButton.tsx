import React from "react";
import { useWalletContext } from "../providers/WalletProvider";

/**
 * Truncate a Stellar address for display
 * Shows first 4 and last 4 characters
 */
function truncateAddress(address: string): string {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

const WalletButton: React.FC = () => {
    const {
        address,
        isConnected,
        isConnecting,
        isDisconnecting,
        error,
        isWalletAvailable,
        connect,
        disconnect,
    } = useWalletContext();

    const handleClick = async () => {
        if (isConnected) {
            await disconnect();
        } else {
            await connect();
        }
    };

    // Show error state if there's an error
    if (error && !isConnecting) {
        return (
            <div className="flex items-center gap-2 rounded-full border border-red-500/50 bg-[#15102A] px-4 py-2 text-sm text-red-400">
                <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
                Error
            </div>
        );
    }

    // Show connected state
    if (isConnected && address) {
        return (
            <button
                onClick={handleClick}
                disabled={isDisconnecting}
                className="flex items-center gap-2 rounded-full border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-white transition-colors hover:border-[#3A356A] hover:bg-[#1A153A] disabled:opacity-50 disabled:cursor-not-allowed"
                title={address}
            >
                <span className="inline-flex h-2 w-2 rounded-full bg-[#52E5A4]" />
                {isDisconnecting ? "Disconnecting..." : truncateAddress(address)}
            </button>
        );
    }

    // Show connecting state
    if (isConnecting) {
        return (
            <button
                disabled
                className="flex items-center gap-2 rounded-full border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-white opacity-50 cursor-not-allowed"
            >
                <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                Connecting...
            </button>
        );
    }

    // Show connect button
    return (
        <button
            onClick={handleClick}
            disabled={!isWalletAvailable}
            className="flex items-center gap-2 rounded-full border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-white transition-colors hover:border-[#3A356A] hover:bg-[#1A153A] disabled:opacity-50 disabled:cursor-not-allowed"
            title={
                !isWalletAvailable
                    ? "Please install a Stellar wallet (e.g., Freighter) to continue"
                    : "Connect Wallet"
            }
        >
            <span className="inline-flex h-2 w-2 rounded-full bg-gray-500" />
            {!isWalletAvailable ? "No Wallet" : "Connect Wallet"}
        </button>
    );
};

export default WalletButton;

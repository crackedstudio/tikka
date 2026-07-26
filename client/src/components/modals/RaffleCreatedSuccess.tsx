/**
 * RaffleCreatedSuccess.tsx
 *
 * Raffle-creation success modal.
 * Now accepts `ConfirmedState` from the shared model for the reference-ID /
 * network fields, while all copy and action buttons remain raffle-specific.
 */

import { X, CheckCircle, ExternalLink, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import type { ConfirmedState } from "./transactionModalState";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RaffleCreatedSuccessProps {
    onClose?: () => void;
    raffleId?: number;
    transactionHash?: string;
    network?: string;
    isVisible?: boolean;
    /**
     * When provided, `referenceId` and `network` are sourced from the shared
     * confirmed state. Falls back to the explicit `transactionHash` / `network`
     * props so existing callers continue to work unchanged.
     */
    modalState?: ConfirmedState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RaffleCreatedSuccess = ({
    onClose,
    raffleId,
    transactionHash,
    network = "Demo Mode",
    isVisible = true,
    modalState,
}: RaffleCreatedSuccessProps) => {
    if (!isVisible) return null;

    // Prefer values from the shared state model
    const displayTxHash = modalState?.referenceId ?? transactionHash;
    const displayNetwork = modalState?.network ?? network;

    const handleCopyTxHash = () => {
        if (displayTxHash) {
            navigator.clipboard.writeText(displayTxHash);
        }
    };

    const handleViewOnExplorer = () => {
        if (displayTxHash) {
            const explorerUrl =
                displayNetwork === "mainnet"
                    ? `https://stellar.expert/explorer/public/tx/${displayTxHash}`
                    : `https://stellar.expert/explorer/testnet/tx/${displayTxHash}`;
            window.open(explorerUrl, "_blank");
        }
    };

    return (
        <div
            data-testid="raffle-created-success-modal"
            className="w-full max-w-[500px] mx-auto px-4 sm:px-6"
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div className="flex-1" />
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-900 dark:text-white hover:text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0"
                        aria-label="Close modal"
                    >
                        <X size={20} className="sm:w-6 sm:h-6" />
                    </button>
                )}
            </div>

            {/* Success Animation */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                    <CheckCircle size={32} className="text-gray-900 dark:text-white" />
                </div>
            </div>

            {/* Success Message */}
            <div className="text-center mb-8 sm:mb-12">
                <h2
                    id="modal-title"
                    className="text-lg sm:text-[22px] font-bold text-gray-900 dark:text-white mb-2"
                >
                    Raffle Created Successfully! 🎉
                </h2>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2">
                    Your raffle has been created successfully.
                </p>
            </div>

            {/* Raffle Details */}
            <div className="bg-[#090E1F] rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="space-y-3">
                    {/* Raffle ID */}
                    {raffleId !== undefined && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                                    Raffle ID:
                                </span>
                                <span className="text-gray-900 dark:text-white font-mono text-xs sm:text-sm">
                                    #{raffleId}
                                </span>
                            </div>
                            <div className="border-t border-gray-200 dark:border-[#1F263F]" />
                        </>
                    )}

                    {/* Transaction Hash */}
                    {displayTxHash && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                                    Transaction Hash:
                                </span>
                                <div className="flex items-center space-x-2">
                                    <span className="text-gray-900 dark:text-white font-mono text-xs sm:text-sm truncate max-w-[120px]">
                                        {displayTxHash.slice(0, 6)}…
                                        {displayTxHash.slice(-4)}
                                    </span>
                                    <button
                                        onClick={handleCopyTxHash}
                                        className="text-gray-400 hover:text-gray-900 dark:text-white transition-colors"
                                        title="Copy transaction hash"
                                        aria-label="Copy transaction hash"
                                    >
                                        <Copy size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="border-t border-gray-200 dark:border-[#1F263F]" />
                        </>
                    )}

                    {/* Mode / Network */}
                    <div className="flex justify-between items-center">
                        <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                            Mode:
                        </span>
                        <div className="flex items-center space-x-1 sm:space-x-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-400 rounded-full" />
                            <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                                {displayNetwork}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 sm:space-y-4">
                {raffleId !== undefined && (
                    <Link
                        to={`/raffles/${raffleId}`}
                        className="w-full bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 dark:text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 text-center block"
                        onClick={onClose}
                    >
                        View My Raffle
                    </Link>
                )}

                {displayTxHash && (
                    <button
                        onClick={handleViewOnExplorer}
                        className="w-full bg-gray-200 dark:bg-[#2A264A] hover:bg-gray-300 dark:hover:bg-[#3A365A] text-gray-900 dark:text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
                    >
                        <ExternalLink size={16} />
                        <span>View on Explorer</span>
                    </button>
                )}

                <Link
                    to="/create"
                    className="w-full bg-transparent border border-pink-500 dark:border-[#FF389C] text-pink-600 dark:text-[#FF389C] hover:bg-[#FF389C]/10 px-6 py-3 rounded-lg font-medium transition-colors duration-200 text-center block"
                    onClick={onClose}
                >
                    Create Another Raffle
                </Link>
            </div>

            {/* Footer */}
            <div className="text-center mt-6">
                <p className="text-gray-400 text-xs sm:text-sm px-2">
                    Your raffle is now live! Share it with your community to get
                    more participants.
                </p>
            </div>
        </div>
    );
};

export default RaffleCreatedSuccess;

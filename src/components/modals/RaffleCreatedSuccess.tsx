import { X, CheckCircle, ExternalLink, Copy } from "lucide-react";
import { Link } from "react-router-dom";

interface RaffleCreatedSuccessProps {
    onClose?: () => void;
    raffleId?: number;
    transactionHash?: string;
    network?: string;
    isVisible?: boolean;
}

const RaffleCreatedSuccess = ({
    onClose,
    raffleId,
    transactionHash,
    network = "Base Sepolia",
    isVisible = true,
}: RaffleCreatedSuccessProps) => {
    if (!isVisible) return null;

    const handleCopyTransactionHash = () => {
        if (transactionHash) {
            navigator.clipboard.writeText(transactionHash);
            // You could add a toast notification here
        }
    };

    const handleViewOnExplorer = () => {
        if (transactionHash) {
            const explorerUrl = `https://sepolia.basescan.org/tx/${transactionHash}`;
            window.open(explorerUrl, "_blank");
        }
    };

    return (
        <div className="w-full max-w-[500px] mx-auto px-4 sm:px-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div className="flex-1"></div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-300 transition-colors flex-shrink-0"
                        aria-label="Close modal"
                    >
                        <X size={20} className="sm:w-6 sm:h-6" />
                    </button>
                )}
            </div>

            {/* Success Animation */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                    <CheckCircle size={32} className="text-white" />
                </div>
            </div>

            {/* Success Message */}
            <div className="text-center mb-8 sm:mb-12">
                <h2 className="text-lg sm:text-[22px] font-bold text-white mb-2">
                    Raffle Created Successfully! 🎉
                </h2>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2">
                    Your raffle has been deployed to the blockchain and is now
                    live for participants to join.
                </p>
            </div>

            {/* Raffle Details */}
            <div className="bg-[#090E1F] rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="space-y-3">
                    {/* Raffle ID */}
                    {raffleId !== undefined && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-white text-xs sm:text-sm">
                                    Raffle ID:
                                </span>
                                <span className="text-white font-mono text-xs sm:text-sm">
                                    #{raffleId}
                                </span>
                            </div>
                            <div className="border-t border-[#1F263F]"></div>
                        </>
                    )}

                    {/* Transaction Hash */}
                    {transactionHash && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-white text-xs sm:text-sm">
                                    Transaction Hash:
                                </span>
                                <div className="flex items-center space-x-2">
                                    <span className="text-white font-mono text-xs sm:text-sm truncate max-w-[120px]">
                                        {transactionHash.slice(0, 6)}...
                                        {transactionHash.slice(-4)}
                                    </span>
                                    <button
                                        onClick={handleCopyTransactionHash}
                                        className="text-gray-400 hover:text-white transition-colors"
                                        title="Copy transaction hash"
                                    >
                                        <Copy size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="border-t border-[#1F263F]"></div>
                        </>
                    )}

                    {/* Network */}
                    <div className="flex justify-between items-center">
                        <span className="text-white text-xs sm:text-sm">
                            Network:
                        </span>
                        <div className="flex items-center space-x-1 sm:space-x-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-400 rounded-full"></div>
                            <span className="text-white text-xs sm:text-sm">
                                {network}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 sm:space-y-4">
                {/* View Raffle Button */}
                {raffleId !== undefined && (
                    <Link
                        to={`/details?raffle=${raffleId}`}
                        className="w-full bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 text-center block"
                        onClick={onClose}
                    >
                        View My Raffle
                    </Link>
                )}

                {/* View on Explorer Button */}
                {transactionHash && (
                    <button
                        onClick={handleViewOnExplorer}
                        className="w-full bg-[#2A264A] hover:bg-[#3A365A] text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
                    >
                        <ExternalLink size={16} />
                        <span>View on Explorer</span>
                    </button>
                )}

                {/* Create Another Raffle Button */}
                <Link
                    to="/create"
                    className="w-full bg-transparent border border-[#FF389C] text-[#FF389C] hover:bg-[#FF389C]/10 px-6 py-3 rounded-lg font-medium transition-colors duration-200 text-center block"
                    onClick={onClose}
                >
                    Create Another Raffle
                </Link>
            </div>

            {/* Bottom Message */}
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

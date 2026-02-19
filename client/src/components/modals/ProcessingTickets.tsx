import { X } from "lucide-react";

interface ProcessingTicketsProps {
    onClose?: () => void;
    transactionHash?: string;
    network?: string;
    isVisible?: boolean;
}

const ProcessingTickets = ({
    onClose,
    transactionHash = "DEMO-7A9D-E3F2",
    network = "Demo Mode",
    isVisible = true,
}: ProcessingTicketsProps) => {
    if (!isVisible) return null;

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

            {/* Processing Animation */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center">
                    {/* Loading spinner animation */}
                    <div className="w-6 h-6 sm:w-8 sm:h-8 border-4 border-[#1A1A2E] border-t-white rounded-full animate-spin"></div>
                </div>
            </div>
            <div className="text-center mb-8 sm:mb-12">
                <h2 className="text-lg sm:text-[22px] font-bold text-white mb-2">
                    Purchasing tickets...
                </h2>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2">
                    This is a demo flow. No onchain transaction is required.
                </p>
            </div>

            {/* Transaction Details */}
            <div className="bg-[#090E1F] rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="space-y-3">
                    {/* Reference ID */}
                    <div className="flex justify-between items-center">
                        <span className="text-white text-xs sm:text-sm">
                            Reference ID:
                        </span>
                        <span className="text-white font-mono text-xs sm:text-sm truncate ml-2">
                            {transactionHash}
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[#1F263F]"></div>

                    {/* Mode */}
                    <div className="flex justify-between items-center">
                        <span className="text-white text-xs sm:text-sm">
                            Mode:
                        </span>
                        <div className="flex items-center space-x-1 sm:space-x-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-yellow-400 rounded-full"></div>
                            <span className="text-white text-xs sm:text-sm">
                                {network}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Message */}
            <div className="text-center">
                <p className="text-gray-400 text-xs sm:text-sm px-2">
                    This window will update automatically when your transaction
                    is confirmed.
                </p>
            </div>
        </div>
    );
};

export default ProcessingTickets;

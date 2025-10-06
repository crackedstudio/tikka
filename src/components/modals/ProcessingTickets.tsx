import { X } from "lucide-react";

interface ProcessingTicketsProps {
    onClose?: () => void;
    transactionHash?: string;
    network?: string;
    isVisible?: boolean;
}

const ProcessingTickets = ({
    onClose,
    transactionHash = "0x7a9d...e3f2",
    network = "Ethereum",
    isVisible = true,
}: ProcessingTicketsProps) => {
    if (!isVisible) return null;

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-300 transition-colors ml-4"
                        aria-label="Close modal"
                    >
                        <X size={24} />
                    </button>
                )}
            </div>

            {/* Processing Animation */}
            <div className="flex justify-center mb-8">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                    {/* Loading spinner animation */}
                    <div className="w-8 h-8 border-4 border-[#1A1A2E] border-t-white rounded-full animate-spin"></div>
                </div>
            </div>
            <div className="text-center mb-12">
                <h2 className="text-[22px] font-bold text-white mb-2">
                    Purchasing tickets...
                </h2>
                <p className="text-[#B6C6E1] text-xs text-center">
                    Your transaction is being processed on the blockchain. This
                    may take a few moments.
                </p>
            </div>

            {/* Transaction Details */}
            <div className="bg-[#090E1F] rounded-xl p-4 mb-6">
                <div className="space-y-3">
                    {/* Transaction Hash */}
                    <div className="flex justify-between items-center">
                        <span className="text-white text-sm">
                            Transaction Hash:
                        </span>
                        <span className="text-white font-mono text-sm">
                            {transactionHash}
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[#1F263F]"></div>

                    {/* Network */}
                    <div className="flex justify-between items-center">
                        <span className="text-white text-sm">Network:</span>
                        <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                            <span className="text-white text-sm">
                                {network}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Message */}
            <div className="text-center">
                <p className="text-gray-400 text-sm">
                    This window will update automatically when your transaction
                    is confirmed.
                </p>
            </div>
        </div>
    );
};

export default ProcessingTickets;

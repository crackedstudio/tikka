import { X } from "lucide-react";

interface ProcessingRaffleCreationProps {
    onClose?: () => void;
    transactionHash?: string;
    network?: string;
    isVisible?: boolean;
    currentStep?: string;
    progress?: number; // 0-100
}

const ProcessingRaffleCreation = ({
    onClose,
    transactionHash = "DEMO-7A9D-E3F2",
    network = "Demo Mode",
    isVisible = true,
    currentStep = "Uploading metadata...",
    progress = 0,
}: ProcessingRaffleCreationProps) => {
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

            {/* Progress Bar */}
            <div className="mb-6 sm:mb-8">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-white text-sm font-medium">
                        Progress
                    </span>
                    <span className="text-white text-sm font-medium">
                        {progress}%
                    </span>
                </div>
                <div className="w-full bg-[#1F263F] rounded-full h-2">
                    <div
                        className="bg-[#FF389C] h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>

            <div className="text-center mb-8 sm:mb-12">
                <h2 className="text-lg sm:text-[22px] font-bold text-white mb-2">
                    Creating your raffle...
                </h2>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2 mb-4">
                    {currentStep}
                </p>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2">
                    This is a demo flow. No wallet connection or onchain
                    transaction is required.
                </p>
            </div>

            {/* Transaction Details */}
            {transactionHash && (
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
            )}

            {/* Bottom Message */}
            <div className="text-center">
                <p className="text-gray-400 text-xs sm:text-sm px-2">
                    This window will update automatically when your raffle is
                    created successfully.
                </p>
            </div>
        </div>
    );
};

export default ProcessingRaffleCreation;

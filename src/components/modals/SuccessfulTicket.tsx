import { X, Check } from "lucide-react";

interface SuccessfulTicketProps {
    onClose?: () => void;
    onContinue?: () => void;
    raffleName?: string;
    isVisible?: boolean;
}

const SuccessfulTicket = ({
    onClose,
    onContinue,
    raffleName = "Bali All Sponsored Ticket",
    isVisible = true,
}: SuccessfulTicketProps) => {
    if (!isVisible) return null;

    return (
        <div className="w-full max-w-[500px] mx-auto px-4 sm:px-6">
            {/* Close Button */}
            {onClose && (
                <div className="flex justify-end mb-4 sm:mb-6">
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-300 transition-colors"
                        aria-label="Close modal"
                    >
                        <X size={20} className="sm:w-6 sm:h-6" />
                    </button>
                </div>
            )}

            {/* Success Indicator */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-500 rounded-full flex items-center justify-center">
                    <Check size={24} className="sm:w-8 sm:h-8 text-white" />
                </div>
            </div>

            {/* Main Heading */}
            <div className="text-center mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">
                    Let's go!!!
                </h2>
                <p className="text-white text-xs sm:text-sm leading-relaxed px-2">
                    Your tickets purchase for{" "}
                    <span className="font-semibold">{raffleName}</span> was
                    successful.
                </p>
            </div>

            {/* Continue Button */}
            <div className="w-full">
                <button
                    onClick={onContinue}
                    className="w-full bg-[#fe3796] hover:bg-[#fe3796]/90 text-white font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-colors text-sm sm:text-base"
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default SuccessfulTicket;

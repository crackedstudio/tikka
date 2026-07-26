/**
 * SuccessfulTicket.tsx
 *
 * Ticket-purchase success modal.
 * Now accepts `TransactionModalState` (phase "confirmed") so the parent can
 * hand the same state object to whichever modal is currently mounted, while
 * the copy here stays ticket-purchase specific.
 */

import { X, Check } from "lucide-react";
import type { ConfirmedState } from "./transactionModalState";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SuccessfulTicketProps {
    onClose?: () => void;
    onContinue?: () => void;
    raffleName?: string;
    isVisible?: boolean;
    /**
     * Optional confirmed state from the shared model.
     * When provided the component can display the reference ID / network.
     */
    modalState?: ConfirmedState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SuccessfulTicket = ({
    onClose,
    onContinue,
    raffleName = "Bali All Sponsored Ticket",
    isVisible = true,
    modalState,
}: SuccessfulTicketProps) => {
    if (!isVisible) return null;

    const referenceId = modalState?.referenceId;
    const network = modalState?.network;

    return (
        <div
            data-testid="success-modal"
            className="w-full max-w-[500px] mx-auto px-4 sm:px-6"
        >
            {/* Close Button */}
            {onClose && (
                <div className="flex justify-end mb-4 sm:mb-6">
                    <button
                        onClick={onClose}
                        className="text-gray-900 dark:text-white hover:text-gray-700 dark:text-gray-300 transition-colors"
                        aria-label="Close modal"
                    >
                        <X size={20} className="sm:w-6 sm:h-6" />
                    </button>
                </div>
            )}

            {/* Success Indicator */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-500 rounded-full flex items-center justify-center">
                    <Check size={24} className="sm:w-8 sm:h-8 text-gray-900 dark:text-white" />
                </div>
            </div>

            {/* Main Heading */}
            <div className="text-center mb-4 sm:mb-6">
                <h2
                    id="modal-title"
                    className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4"
                >
                    Let&apos;s go!!!
                </h2>
                <p className="text-gray-900 dark:text-white text-xs sm:text-sm leading-relaxed px-2">
                    Your tickets purchase for{" "}
                    <span className="font-semibold">{raffleName}</span> was
                    successful.
                </p>
            </div>

            {/* Optional on-chain details */}
            {(referenceId || network) && (
                <div className="bg-[#090E1F] rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                    <div className="space-y-3">
                        {referenceId && (
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-xs sm:text-sm">
                                    Tx Hash:
                                </span>
                                <span className="text-gray-900 dark:text-white font-mono text-xs truncate ml-2 max-w-[160px]">
                                    {referenceId}
                                </span>
                            </div>
                        )}
                        {referenceId && network && (
                            <div className="border-t border-gray-200 dark:border-[#1F263F]" />
                        )}
                        {network && (
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-xs sm:text-sm">
                                    Network:
                                </span>
                                <div className="flex items-center space-x-1 sm:space-x-2">
                                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-400 rounded-full" />
                                    <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                                        {network}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Continue Button */}
            <div className="w-full">
                <button
                    data-testid="success-continue-btn"
                    onClick={onContinue}
                    className="w-full bg-[#fe3796] hover:bg-[#fe3796]/90 text-gray-900 dark:text-white font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-colors text-sm sm:text-base"
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default SuccessfulTicket;

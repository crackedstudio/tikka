/**
 * FailedTicket.tsx
 *
 * Ticket-purchase failure modal.
 * Accepts both `FailedState` and `RetryableState` from the shared model so it
 * can surface the correct error message and conditionally render a Retry CTA.
 * Ticket-specific copy is preserved.
 */

import { X, XCircle, RefreshCw } from "lucide-react";
import type { FailedState, RetryableState } from "./transactionModalState";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FailedTicketProps {
    onClose?: () => void;
    /** Fired when the user clicks the primary action ("Try again" or "Continue"). */
    onContinue?: () => void;
    /** Fired explicitly when the user wants to retry (if `modalState.canRetry`). */
    onRetry?: () => void;
    raffleName?: string;
    isVisible?: boolean;
    /**
     * When provided, error message and retry capability are derived from the
     * shared state model. Falls back to generic copy when omitted.
     */
    modalState?: FailedState | RetryableState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FailedTicket = ({
    onClose,
    onContinue,
    onRetry,
    raffleName = "Bali All Sponsored Ticket",
    isVisible = true,
    modalState,
}: FailedTicketProps) => {
    if (!isVisible) return null;

    const errorMessage = modalState?.errorMessage;
    const canRetry =
        modalState?.phase === "retryable" ? modalState.canRetry : false;
    const dismissible =
        modalState?.phase === "failed" ? (modalState.dismissible ?? true) : true;

    const handlePrimary = canRetry ? (onRetry ?? onContinue) : onContinue;

    return (
        <div
            data-testid="failed-ticket-modal"
            className="w-full max-w-[500px] mx-auto px-4 sm:px-6"
        >
            {/* Close Button */}
            {onClose && dismissible && (
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

            {/* Error Indicator */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-500 rounded-full flex items-center justify-center">
                    <XCircle
                        size={24}
                        className="sm:w-8 sm:h-8 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {/* Main Heading */}
            <div className="text-center mb-4 sm:mb-6">
                <h2
                    id="modal-title"
                    className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4"
                >
                    Oh oh…
                </h2>
                <p className="text-gray-900 dark:text-white text-xs sm:text-sm leading-relaxed px-2">
                    {errorMessage ??
                        <>
                            Unfortunately, your purchase for the{" "}
                            <span className="font-semibold">{raffleName}</span>{" "}
                            did not go through. Pls try again.
                        </>}
                </p>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-3">
                {canRetry && (
                    <button
                        data-testid="failed-retry-btn"
                        onClick={onRetry ?? onContinue}
                        className="w-full bg-[#fe3796] hover:bg-[#fe3796]/90 text-gray-900 dark:text-white font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-colors text-sm sm:text-base flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={16} />
                        Try again
                    </button>
                )}

                <button
                    data-testid="failed-continue-btn"
                    onClick={handlePrimary}
                    className={`w-full font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-colors text-sm sm:text-base ${
                        canRetry
                            ? "bg-transparent border border-gray-500 dark:border-[#1F263F] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1F263F]/40"
                            : "bg-[#fe3796] hover:bg-[#fe3796]/90 text-gray-900 dark:text-white"
                    }`}
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default FailedTicket;

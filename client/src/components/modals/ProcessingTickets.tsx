/**
 * ProcessingTickets.tsx
 *
 * Ticket-purchase processing modal.
 * Now driven by `TransactionModalState` so it mirrors the shared phase model
 * (awaiting_signature → submitting → …) while keeping ticket-specific copy.
 */

import { X } from "lucide-react";
import type { TransactionModalState } from "./transactionModalState";
import { isInFlight } from "./transactionModalState";

// ---------------------------------------------------------------------------
// Legacy prop API  (kept for backwards-compatibility with existing callers)
// ---------------------------------------------------------------------------

interface LegacyProps {
    /** @deprecated Pass `modalState` instead. */
    transactionHash?: string;
    /** @deprecated Pass `modalState` instead. */
    network?: string;
    isVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Primary prop API
// ---------------------------------------------------------------------------

export interface ProcessingTicketsProps extends LegacyProps {
    onClose?: () => void;
    /**
     * When provided, the component renders based on the shared state model.
     * When omitted the component falls back to the legacy always-spinning UI.
     */
    modalState?: TransactionModalState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProcessingTickets = ({
    onClose,
    transactionHash,
    network = "Demo Mode",
    isVisible = true,
    modalState,
}: ProcessingTicketsProps) => {
    if (!isVisible) return null;

    // Derive display values from modalState when present, else use legacy props
    const phase = modalState?.phase ?? "submitting";
    const inFlight = modalState ? isInFlight(modalState) : true;

    const stepLabel =
        modalState?.phase === "awaiting_signature"
            ? modalState.stepLabel
            : modalState?.phase === "submitting"
              ? modalState.stepLabel
              : "Purchasing tickets...";

    const refId =
        modalState?.phase === "submitting"
            ? (modalState.referenceId ?? transactionHash ?? "—")
            : (transactionHash ?? "—");

    const displayNetwork =
        modalState?.phase === "submitting"
            ? (modalState.network ?? network)
            : network;

    const canClose = onClose && (!inFlight || phase === "failed" || phase === "retryable");

    return (
        <div
            data-testid="processing-tickets-modal"
            className="w-full max-w-[500px] mx-auto px-4 sm:px-6"
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div className="flex-1" />
                {canClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-900 dark:text-white hover:text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0"
                        aria-label="Close modal"
                    >
                        <X size={20} className="sm:w-6 sm:h-6" />
                    </button>
                )}
            </div>

            {/* Spinner */}
            <div className="flex justify-center mb-6 sm:mb-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center">
                    <div
                        data-testid="processing-spinner"
                        className="w-6 h-6 sm:w-8 sm:h-8 border-4 border-[#1A1A2E] border-t-white rounded-full animate-spin"
                    />
                </div>
            </div>

            {/* Copy */}
            <div className="text-center mb-8 sm:mb-12">
                <h2
                    id="modal-title"
                    className="text-lg sm:text-[22px] font-bold text-gray-900 dark:text-white mb-2"
                >
                    {phase === "awaiting_signature"
                        ? "Awaiting signature…"
                        : "Purchasing tickets…"}
                </h2>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2">
                    {stepLabel}
                </p>
            </div>

            {/* Transaction details */}
            <div className="bg-[#090E1F] rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                            Reference ID:
                        </span>
                        <span className="text-gray-900 dark:text-white font-mono text-xs sm:text-sm truncate ml-2">
                            {refId}
                        </span>
                    </div>

                    <div className="border-t border-gray-200 dark:border-[#1F263F]" />

                    <div className="flex justify-between items-center">
                        <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                            Mode:
                        </span>
                        <div className="flex items-center space-x-1 sm:space-x-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-yellow-400 rounded-full" />
                            <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                                {displayNetwork}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
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

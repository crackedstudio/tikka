/**
 * ProcessingRaffleCreation.tsx
 *
 * Raffle-creation processing modal.
 * Now driven by `TransactionModalState` while keeping its raffle-specific
 * progress bar and multi-step copy.
 */

import { X } from "lucide-react";
import type { TransactionModalState } from "./transactionModalState";
import { isInFlight } from "./transactionModalState";

// ---------------------------------------------------------------------------
// Legacy prop API  (kept for backwards-compatibility)
// ---------------------------------------------------------------------------

interface LegacyProps {
    /** @deprecated Pass `modalState` instead. */
    transactionHash?: string;
    /** @deprecated Pass `modalState` instead. */
    network?: string;
    /** @deprecated Pass `modalState` instead. */
    currentStep?: string;
    /** @deprecated Pass `modalState` instead. */
    progress?: number; // 0-100
    isVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Primary prop API
// ---------------------------------------------------------------------------

export interface ProcessingRaffleCreationProps extends LegacyProps {
    onClose?: () => void;
    /**
     * When provided, the component derives all display values from the shared
     * state model. Falls back to legacy props when omitted.
     */
    modalState?: TransactionModalState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProcessingRaffleCreation = ({
    onClose,
    transactionHash,
    network = "Demo Mode",
    currentStep = "Uploading metadata...",
    progress = 0,
    isVisible = true,
    modalState,
}: ProcessingRaffleCreationProps) => {
    if (!isVisible) return null;

    const phase = modalState?.phase ?? "submitting";
    const inFlight = modalState ? isInFlight(modalState) : true;

    const displayStep =
        modalState?.phase === "awaiting_signature"
            ? modalState.stepLabel
            : modalState?.phase === "submitting"
              ? modalState.stepLabel
              : currentStep;

    const displayProgress =
        modalState?.phase === "submitting"
            ? (modalState.progress ?? progress)
            : progress;

    const displayNetwork =
        modalState?.phase === "submitting"
            ? (modalState.network ?? network)
            : network;

    const displayRefId =
        modalState?.phase === "submitting"
            ? (modalState.referenceId ?? transactionHash)
            : transactionHash;

    const canClose =
        onClose && (!inFlight || phase === "failed" || phase === "retryable");

    return (
        <div
            data-testid="processing-raffle-creation-modal"
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

            {/* Progress Bar */}
            <div className="mb-6 sm:mb-8">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-900 dark:text-white text-sm font-medium">
                        Progress
                    </span>
                    <span className="text-gray-900 dark:text-white text-sm font-medium">
                        {displayProgress}%
                    </span>
                </div>
                <div
                    role="progressbar"
                    aria-valuenow={displayProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="w-full bg-[#1F263F] rounded-full h-2"
                >
                    <div
                        className="bg-[#FF389C] h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${displayProgress}%` }}
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
                        : "Creating your raffle…"}
                </h2>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2 mb-4">
                    {displayStep}
                </p>
                <p className="text-[#B6C6E1] text-xs sm:text-sm text-center px-2">
                    Keep this window open while we upload metadata and submit
                    your transaction.
                </p>
            </div>

            {/* Transaction Details */}
            {displayRefId && (
                <div className="bg-[#090E1F] rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                                Reference ID:
                            </span>
                            <span className="text-gray-900 dark:text-white font-mono text-xs sm:text-sm truncate ml-2">
                                {displayRefId}
                            </span>
                        </div>

                        <div className="border-t border-gray-200 dark:border-[#1F263F]" />

                        <div className="flex justify-between items-center">
                            <span className="text-gray-900 dark:text-white text-xs sm:text-sm">
                                Network:
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
            )}

            {/* Footer */}
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

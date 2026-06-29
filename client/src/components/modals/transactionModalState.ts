/**
 * transactionModalState.ts
 *
 * Shared state model for transaction processing modals.
 *
 * Both the ticket-purchase flow and the raffle-creation flow go through
 * identical lifecycle phases.  Defining them once here keeps the two flows
 * in sync and makes it trivial to add a third flow later.
 *
 * State machine
 * ─────────────
 *
 *   idle ──► awaiting_signature ──► submitting ──► confirmed
 *                   │                   │
 *                   └───────────────────┴──► failed
 *                                            │
 *                                            └──► retryable (soft failure,
 *                                                           user may retry)
 */

// ---------------------------------------------------------------------------
// State discriminant
// ---------------------------------------------------------------------------

/** All possible states a transaction modal can be in. */
export type TransactionModalPhase =
    | "idle"
    | "awaiting_signature"
    | "submitting"
    | "confirmed"
    | "failed"
    | "retryable";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

/**
 * `TransactionModalState` is a discriminated union so that each phase can
 * carry exactly the data it needs (and nothing it doesn't).
 */
export type TransactionModalState =
    | IdleState
    | AwaitingSignatureState
    | SubmittingState
    | ConfirmedState
    | FailedState
    | RetryableState;

export interface IdleState {
    phase: "idle";
}

export interface AwaitingSignatureState {
    phase: "awaiting_signature";
    /** Human-readable label shown below the spinner, e.g. "Waiting for wallet signature…" */
    stepLabel: string;
}

export interface SubmittingState {
    phase: "submitting";
    stepLabel: string;
    /**
     * Optional 0–100 progress value.  When omitted the UI shows an
     * indeterminate spinner instead of a progress bar.
     */
    progress?: number;
    /** Optional on-chain reference (txHash / reference ID). */
    referenceId?: string;
    /** Network name for display, e.g. "testnet". */
    network?: string;
}

export interface ConfirmedState {
    phase: "confirmed";
    referenceId?: string;
    network?: string;
}

export interface FailedState {
    phase: "failed";
    /** Short error description shown to the user. */
    errorMessage: string;
    /** Whether the user is allowed to dismiss the modal. */
    dismissible?: boolean;
}

export interface RetryableState {
    phase: "retryable";
    errorMessage: string;
    /** When true the consuming component should offer a "Try again" CTA. */
    canRetry: boolean;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export const isIdle = (s: TransactionModalState): s is IdleState =>
    s.phase === "idle";

export const isAwaitingSignature = (
    s: TransactionModalState,
): s is AwaitingSignatureState => s.phase === "awaiting_signature";

export const isSubmitting = (s: TransactionModalState): s is SubmittingState =>
    s.phase === "submitting";

export const isConfirmed = (s: TransactionModalState): s is ConfirmedState =>
    s.phase === "confirmed";

export const isFailed = (s: TransactionModalState): s is FailedState =>
    s.phase === "failed";

export const isRetryable = (s: TransactionModalState): s is RetryableState =>
    s.phase === "retryable";

/** True for any "in-flight" phase — useful for disabling the close button. */
export const isInFlight = (s: TransactionModalState): boolean =>
    s.phase === "awaiting_signature" || s.phase === "submitting";

/** True for any terminal phase — the flow has ended (success or failure). */
export const isTerminal = (s: TransactionModalState): boolean =>
    s.phase === "confirmed" || s.phase === "failed" || s.phase === "retryable";

// ---------------------------------------------------------------------------
// Factory helpers  (keep construction sites DRY)
// ---------------------------------------------------------------------------

export const modalState = {
    idle: (): IdleState => ({ phase: "idle" }),

    awaitingSignature: (stepLabel: string): AwaitingSignatureState => ({
        phase: "awaiting_signature",
        stepLabel,
    }),

    submitting: (
        stepLabel: string,
        opts?: { progress?: number; referenceId?: string; network?: string },
    ): SubmittingState => ({
        phase: "submitting",
        stepLabel,
        ...opts,
    }),

    confirmed: (opts?: {
        referenceId?: string;
        network?: string;
    }): ConfirmedState => ({
        phase: "confirmed",
        ...opts,
    }),

    failed: (
        errorMessage: string,
        opts?: { dismissible?: boolean },
    ): FailedState => ({
        phase: "failed",
        errorMessage,
        dismissible: opts?.dismissible ?? true,
    }),

    retryable: (
        errorMessage: string,
        canRetry = true,
    ): RetryableState => ({
        phase: "retryable",
        errorMessage,
        canRetry,
    }),
} as const;

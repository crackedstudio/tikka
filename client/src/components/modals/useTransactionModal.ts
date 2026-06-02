/**
 * useTransactionModal.ts
 *
 * Shared React hook that manages a `TransactionModalState` value and exposes
 * a stable set of transition helpers.
 *
 * Usage
 * ─────
 *   const { state, actions, isOpen } = useTransactionModal();
 *
 *   // start the flow
 *   actions.awaitSignature("Waiting for wallet…");
 *
 *   // once the tx is broadcasting
 *   actions.submit("Submitting…", { progress: 60, referenceId: txHash });
 *
 *   // on success
 *   actions.confirm({ referenceId: txHash, network: "testnet" });
 *
 *   // on hard failure
 *   actions.fail("Insufficient funds.");
 *
 *   // on soft failure (can retry)
 *   actions.setRetryable("Network error – please try again.");
 *
 *   // reset
 *   actions.reset();
 *
 * The `isOpen` boolean is derived automatically: the modal should be shown
 * for every phase except `idle`.
 */

import { useState, useCallback } from "react";
import {
    modalState,
    type ConfirmedState,
    type TransactionModalState,
} from "./transactionModalState";

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface TransactionModalActions {
    awaitSignature: (stepLabel: string) => void;
    submit: (
        stepLabel: string,
        opts?: { progress?: number; referenceId?: string; network?: string },
    ) => void;
    confirm: (opts?: { referenceId?: string; network?: string }) => void;
    fail: (errorMessage: string, opts?: { dismissible?: boolean }) => void;
    setRetryable: (errorMessage: string, canRetry?: boolean) => void;
    reset: () => void;
    /** Directly set an arbitrary state (escape hatch for complex flows). */
    set: (next: TransactionModalState) => void;
}

export interface UseTransactionModalReturn {
    state: TransactionModalState;
    actions: TransactionModalActions;
    /** Convenience: true whenever the phase is not "idle". */
    isOpen: boolean;
    /** Convenience: the confirmed state (defined only when phase === "confirmed"). */
    confirmedState: ConfirmedState | undefined;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTransactionModal(): UseTransactionModalReturn {
    const [state, setState] = useState<TransactionModalState>(
        modalState.idle(),
    );

    const awaitSignature = useCallback((stepLabel: string) => {
        setState(modalState.awaitingSignature(stepLabel));
    }, []);

    const submit = useCallback(
        (
            stepLabel: string,
            opts?: { progress?: number; referenceId?: string; network?: string },
        ) => {
            setState(modalState.submitting(stepLabel, opts));
        },
        [],
    );

    const confirm = useCallback(
        (opts?: { referenceId?: string; network?: string }) => {
            setState(modalState.confirmed(opts));
        },
        [],
    );

    const fail = useCallback(
        (errorMessage: string, opts?: { dismissible?: boolean }) => {
            setState(modalState.failed(errorMessage, opts));
        },
        [],
    );

    const setRetryable = useCallback(
        (errorMessage: string, canRetry = true) => {
            setState(modalState.retryable(errorMessage, canRetry));
        },
        [],
    );

    const reset = useCallback(() => {
        setState(modalState.idle());
    }, []);

    const set = useCallback((next: TransactionModalState) => {
        setState(next);
    }, []);

    const isOpen = state.phase !== "idle";
    const confirmedState =
        state.phase === "confirmed" ? (state as ConfirmedState) : undefined;

    return {
        state,
        actions: { awaitSignature, submit, confirm, fail, setRetryable, reset, set },
        isOpen,
        confirmedState,
    };
}

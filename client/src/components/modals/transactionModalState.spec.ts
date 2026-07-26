/**
 * transactionModalState.spec.ts
 *
 * Unit tests for the shared transaction-modal state model and the
 * `useTransactionModal` hook.
 *
 * Run with:  npm run test  (vitest)
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
    modalState,
    isIdle,
    isAwaitingSignature,
    isSubmitting,
    isConfirmed,
    isFailed,
    isRetryable,
    isInFlight,
    isTerminal,
} from "./transactionModalState";

import { useTransactionModal } from "./useTransactionModal";

// ---------------------------------------------------------------------------
// modalState factories
// ---------------------------------------------------------------------------

describe("modalState factories", () => {
    it("idle() produces an idle state", () => {
        const s = modalState.idle();
        expect(s.phase).toBe("idle");
        expect(isIdle(s)).toBe(true);
    });

    it("awaitingSignature() produces the correct shape", () => {
        const s = modalState.awaitingSignature("Waiting for wallet…");
        expect(s.phase).toBe("awaiting_signature");
        expect(s.stepLabel).toBe("Waiting for wallet…");
        expect(isAwaitingSignature(s)).toBe(true);
    });

    it("submitting() carries optional fields", () => {
        const s = modalState.submitting("Submitting…", {
            progress: 60,
            referenceId: "abc123",
            network: "testnet",
        });
        expect(s.phase).toBe("submitting");
        expect(s.progress).toBe(60);
        expect(s.referenceId).toBe("abc123");
        expect(s.network).toBe("testnet");
        expect(isSubmitting(s)).toBe(true);
    });

    it("submitting() without opts leaves optional fields undefined", () => {
        const s = modalState.submitting("Submitting…");
        expect(s.progress).toBeUndefined();
        expect(s.referenceId).toBeUndefined();
    });

    it("confirmed() carries optional fields", () => {
        const s = modalState.confirmed({ referenceId: "xyz", network: "mainnet" });
        expect(s.phase).toBe("confirmed");
        expect(s.referenceId).toBe("xyz");
        expect(s.network).toBe("mainnet");
        expect(isConfirmed(s)).toBe(true);
    });

    it("confirmed() without opts leaves optional fields undefined", () => {
        const s = modalState.confirmed();
        expect(s.referenceId).toBeUndefined();
        expect(s.network).toBeUndefined();
    });

    it("failed() defaults dismissible to true", () => {
        const s = modalState.failed("Something went wrong");
        expect(s.phase).toBe("failed");
        expect(s.errorMessage).toBe("Something went wrong");
        expect(s.dismissible).toBe(true);
        expect(isFailed(s)).toBe(true);
    });

    it("failed() respects explicit dismissible=false", () => {
        const s = modalState.failed("Critical failure", { dismissible: false });
        expect(s.dismissible).toBe(false);
    });

    it("retryable() defaults canRetry to true", () => {
        const s = modalState.retryable("Network error");
        expect(s.phase).toBe("retryable");
        expect(s.canRetry).toBe(true);
        expect(isRetryable(s)).toBe(true);
    });

    it("retryable() respects explicit canRetry=false", () => {
        const s = modalState.retryable("Permanent error", false);
        expect(s.canRetry).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe("type guards", () => {
    it("isInFlight is true only for awaiting_signature and submitting", () => {
        expect(isInFlight(modalState.idle())).toBe(false);
        expect(isInFlight(modalState.awaitingSignature("…"))).toBe(true);
        expect(isInFlight(modalState.submitting("…"))).toBe(true);
        expect(isInFlight(modalState.confirmed())).toBe(false);
        expect(isInFlight(modalState.failed("err"))).toBe(false);
        expect(isInFlight(modalState.retryable("err"))).toBe(false);
    });

    it("isTerminal is true only for confirmed, failed, retryable", () => {
        expect(isTerminal(modalState.idle())).toBe(false);
        expect(isTerminal(modalState.awaitingSignature("…"))).toBe(false);
        expect(isTerminal(modalState.submitting("…"))).toBe(false);
        expect(isTerminal(modalState.confirmed())).toBe(true);
        expect(isTerminal(modalState.failed("err"))).toBe(true);
        expect(isTerminal(modalState.retryable("err"))).toBe(true);
    });

    it("every guard returns false for an unrelated state", () => {
        const idle = modalState.idle();
        expect(isAwaitingSignature(idle)).toBe(false);
        expect(isSubmitting(idle)).toBe(false);
        expect(isConfirmed(idle)).toBe(false);
        expect(isFailed(idle)).toBe(false);
        expect(isRetryable(idle)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// useTransactionModal hook
// ---------------------------------------------------------------------------

describe("useTransactionModal", () => {
    it("starts in idle state with isOpen=false", () => {
        const { result } = renderHook(() => useTransactionModal());
        expect(result.current.state.phase).toBe("idle");
        expect(result.current.isOpen).toBe(false);
        expect(result.current.confirmedState).toBeUndefined();
    });

    it("awaitSignature transitions to awaiting_signature", () => {
        const { result } = renderHook(() => useTransactionModal());
        act(() => result.current.actions.awaitSignature("Waiting for wallet…"));
        expect(result.current.state.phase).toBe("awaiting_signature");
        expect(result.current.isOpen).toBe(true);
    });

    it("submit transitions to submitting with all optional fields", () => {
        const { result } = renderHook(() => useTransactionModal());
        act(() =>
            result.current.actions.submit("Submitting…", {
                progress: 75,
                referenceId: "tx-abc",
                network: "testnet",
            }),
        );
        const s = result.current.state;
        expect(s.phase).toBe("submitting");
        if (s.phase === "submitting") {
            expect(s.progress).toBe(75);
            expect(s.referenceId).toBe("tx-abc");
            expect(s.network).toBe("testnet");
        }
    });

    it("confirm transitions to confirmed and exposes confirmedState", () => {
        const { result } = renderHook(() => useTransactionModal());
        act(() =>
            result.current.actions.confirm({ referenceId: "tx-xyz", network: "mainnet" }),
        );
        expect(result.current.state.phase).toBe("confirmed");
        expect(result.current.confirmedState?.referenceId).toBe("tx-xyz");
        expect(result.current.confirmedState?.network).toBe("mainnet");
        expect(result.current.isOpen).toBe(true);
    });

    it("fail transitions to failed", () => {
        const { result } = renderHook(() => useTransactionModal());
        act(() => result.current.actions.fail("Insufficient funds", { dismissible: false }));
        const s = result.current.state;
        expect(s.phase).toBe("failed");
        if (s.phase === "failed") {
            expect(s.errorMessage).toBe("Insufficient funds");
            expect(s.dismissible).toBe(false);
        }
    });

    it("setRetryable transitions to retryable", () => {
        const { result } = renderHook(() => useTransactionModal());
        act(() => result.current.actions.setRetryable("Network timeout", true));
        const s = result.current.state;
        expect(s.phase).toBe("retryable");
        if (s.phase === "retryable") {
            expect(s.canRetry).toBe(true);
        }
    });

    it("reset returns to idle and closes the modal", () => {
        const { result } = renderHook(() => useTransactionModal());
        act(() => result.current.actions.confirm());
        expect(result.current.isOpen).toBe(true);

        act(() => result.current.actions.reset());
        expect(result.current.state.phase).toBe("idle");
        expect(result.current.isOpen).toBe(false);
        expect(result.current.confirmedState).toBeUndefined();
    });

    it("set() can apply an arbitrary state directly", () => {
        const { result } = renderHook(() => useTransactionModal());
        const customState = modalState.submitting("Custom step", { progress: 42 });
        act(() => result.current.actions.set(customState));
        const s = result.current.state;
        expect(s.phase).toBe("submitting");
        if (s.phase === "submitting") {
            expect(s.progress).toBe(42);
        }
    });

    it("full happy-path sequence: idle → awaiting → submitting → confirmed → reset", () => {
        const { result } = renderHook(() => useTransactionModal());

        act(() => result.current.actions.awaitSignature("Sign the transaction"));
        expect(result.current.state.phase).toBe("awaiting_signature");

        act(() => result.current.actions.submit("Broadcasting…", { progress: 50 }));
        expect(result.current.state.phase).toBe("submitting");

        act(() => result.current.actions.confirm({ referenceId: "hash-001" }));
        expect(result.current.state.phase).toBe("confirmed");
        expect(result.current.confirmedState?.referenceId).toBe("hash-001");

        act(() => result.current.actions.reset());
        expect(result.current.state.phase).toBe("idle");
    });

    it("full failure-path sequence: idle → awaiting → failed → retryable → reset", () => {
        const { result } = renderHook(() => useTransactionModal());

        act(() => result.current.actions.awaitSignature("Sign the transaction"));
        act(() => result.current.actions.fail("User rejected"));
        expect(result.current.state.phase).toBe("failed");

        act(() => result.current.actions.setRetryable("Network error – please retry"));
        expect(result.current.state.phase).toBe("retryable");

        act(() => result.current.actions.reset());
        expect(result.current.state.phase).toBe("idle");
    });
});

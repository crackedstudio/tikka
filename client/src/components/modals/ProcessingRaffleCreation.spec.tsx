/**
 * ProcessingRaffleCreation.spec.tsx
 *
 * Tests for the ProcessingRaffleCreation modal content component.
 *
 * Key invariant under test
 * ────────────────────────
 * The component MUST NOT render a close/dismiss button while a transaction
 * is in-flight (awaiting_signature or submitting phases).  This prevents the
 * user from accidentally losing the pending transaction reference by closing
 * the modal.  The close button only appears in terminal states (failed /
 * retryable) or when the legacy prop-based flow is used without a modalState.
 *
 * Focus-trap and Escape-to-close are tested through the Modal wrapper so that
 * the evidence covers the full dialog contract.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Modal from "./Modal";
import ProcessingRaffleCreation from "./ProcessingRaffleCreation";
import { modalState } from "./transactionModalState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderProcessing(
    props: Partial<React.ComponentProps<typeof ProcessingRaffleCreation>> = {}
) {
    return render(<ProcessingRaffleCreation {...props} />);
}

function renderInModal(
    props: Partial<React.ComponentProps<typeof ProcessingRaffleCreation>> = {},
    onClose = vi.fn()
) {
    return render(
        <Modal open={true} onClose={onClose}>
            <ProcessingRaffleCreation onClose={onClose} {...props} />
        </Modal>
    );
}

beforeEach(() => {
    const modalRoot = document.createElement("div");
    modalRoot.id = "modal-root";
    document.body.appendChild(modalRoot);
});

afterEach(() => {
    const modalRoot = document.getElementById("modal-root");
    if (modalRoot) document.body.removeChild(modalRoot);
});

// ---------------------------------------------------------------------------
// Visibility gate
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — visibility gate", () => {
    it("renders nothing when isVisible=false", () => {
        const { container } = renderProcessing({ isVisible: false });
        expect(container.firstChild).toBeNull();
    });

    it("renders when isVisible=true (default)", () => {
        renderProcessing();
        expect(
            screen.getByTestId("processing-raffle-creation-modal")
        ).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Default / legacy prop state (no modalState)
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — legacy props (no modalState)", () => {
    it("renders the spinner", () => {
        renderProcessing();
        expect(screen.getByTestId("processing-spinner")).toBeInTheDocument();
    });

    it("renders the 'Creating your raffle…' heading by default", () => {
        renderProcessing();
        expect(
            screen.getByRole("heading", { name: /creating your raffle/i })
        ).toBeInTheDocument();
    });

    it("shows the custom currentStep text", () => {
        renderProcessing({ currentStep: "Uploading metadata…" });
        expect(screen.getByText("Uploading metadata…")).toBeInTheDocument();
    });

    it("shows progress percentage", () => {
        renderProcessing({ progress: 42 });
        expect(screen.getByText("42%")).toBeInTheDocument();
    });

    it("renders a progressbar with correct aria-valuenow", () => {
        renderProcessing({ progress: 75 });
        const progressbar = screen.getByRole("progressbar");
        expect(progressbar).toHaveAttribute("aria-valuenow", "75");
        expect(progressbar).toHaveAttribute("aria-valuemin", "0");
        expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    });

    it("renders the reference ID when transactionHash is provided", () => {
        renderProcessing({ transactionHash: "tx-legacy-ref" });
        expect(screen.getByText("tx-legacy-ref")).toBeInTheDocument();
    });

    it("omits the transaction details section when no hash is provided", () => {
        renderProcessing();
        expect(screen.queryByText(/reference id/i)).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// In-flight states — close button MUST NOT appear
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — in-flight states block dismissal", () => {
    it("does NOT render close button during awaiting_signature phase", () => {
        renderProcessing({
            onClose: vi.fn(),
            modalState: modalState.awaitingSignature("Waiting for wallet…"),
        });
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });

    it("does NOT render close button during submitting phase", () => {
        renderProcessing({
            onClose: vi.fn(),
            modalState: modalState.submitting("Broadcasting transaction…", {
                progress: 50,
                referenceId: "tx-in-flight",
                network: "testnet",
            }),
        });
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });

    it("preserves referenceId in DOM during submitting phase (no dismissal path)", () => {
        renderProcessing({
            onClose: vi.fn(),
            modalState: modalState.submitting("Broadcasting…", {
                referenceId: "tx-must-survive",
                network: "testnet",
            }),
        });
        // The reference ID is visible but there is no way to dismiss the modal
        expect(screen.getByText("tx-must-survive")).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });

    it("does NOT render close button even when onClose is provided and phase is submitting", () => {
        renderProcessing({
            onClose: vi.fn(),
            modalState: modalState.submitting("Submitting…"),
        });
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// awaiting_signature phase
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — awaiting_signature phase", () => {
    it("shows 'Awaiting signature…' heading", () => {
        renderProcessing({
            modalState: modalState.awaitingSignature("Confirm in your wallet"),
        });
        expect(
            screen.getByRole("heading", { name: /awaiting signature/i })
        ).toBeInTheDocument();
    });

    it("shows the stepLabel from the awaiting_signature state", () => {
        renderProcessing({
            modalState: modalState.awaitingSignature("Confirm in your wallet"),
        });
        expect(
            screen.getByText("Confirm in your wallet")
        ).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// submitting phase
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — submitting phase", () => {
    it("shows 'Creating your raffle…' heading", () => {
        renderProcessing({
            modalState: modalState.submitting("Uploading IPFS metadata…", {
                progress: 30,
            }),
        });
        expect(
            screen.getByRole("heading", { name: /creating your raffle/i })
        ).toBeInTheDocument();
    });

    it("shows progress from the submitting state", () => {
        renderProcessing({
            modalState: modalState.submitting("Uploading…", { progress: 68 }),
        });
        expect(screen.getByText("68%")).toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toHaveAttribute(
            "aria-valuenow",
            "68"
        );
    });

    it("shows network from submitting state", () => {
        renderProcessing({
            modalState: modalState.submitting("Broadcasting…", {
                // referenceId is required for the details section (and network) to render
                referenceId: "tx-ref",
                network: "testnet",
            }),
        });
        expect(screen.getByText("testnet")).toBeInTheDocument();
    });

    it("shows referenceId from submitting state", () => {
        renderProcessing({
            modalState: modalState.submitting("Broadcasting…", {
                referenceId: "tx-abc-123",
                network: "testnet",
            }),
        });
        expect(screen.getByText("tx-abc-123")).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// failed phase — dismissal IS allowed
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — failed phase", () => {
    it("renders the close button when phase is failed", () => {
        renderProcessing({
            onClose: vi.fn(),
            modalState: modalState.failed("Transaction rejected by user"),
        });
        expect(
            screen.getByRole("button", { name: /close modal/i })
        ).toBeInTheDocument();
    });

    it("calls onClose when close button is clicked in failed state", () => {
        const onClose = vi.fn();
        renderProcessing({
            onClose,
            modalState: modalState.failed("Something went wrong"),
        });
        fireEvent.click(screen.getByRole("button", { name: /close modal/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT render close button when onClose is absent (failed state)", () => {
        renderProcessing({
            modalState: modalState.failed("Error"),
        });
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// retryable phase — dismissal IS allowed
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — retryable phase", () => {
    it("renders the close button when phase is retryable", () => {
        renderProcessing({
            onClose: vi.fn(),
            modalState: modalState.retryable("Network timeout – please retry"),
        });
        expect(
            screen.getByRole("button", { name: /close modal/i })
        ).toBeInTheDocument();
    });

    it("calls onClose when close button is clicked in retryable state", () => {
        const onClose = vi.fn();
        renderProcessing({
            onClose,
            modalState: modalState.retryable("Network error"),
        });
        fireEvent.click(screen.getByRole("button", { name: /close modal/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// No onClose prop — close button never rendered regardless of phase
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — no onClose prop", () => {
    it("never renders the close button when onClose is absent (failed phase)", () => {
        renderProcessing({
            modalState: modalState.failed("Error"),
            // no onClose
        });
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });

    it("never renders the close button when onClose is absent (retryable phase)", () => {
        renderProcessing({
            modalState: modalState.retryable("Timeout"),
            // no onClose
        });
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Focus management and Escape-to-close (via Modal wrapper)
// ---------------------------------------------------------------------------

describe("ProcessingRaffleCreation — a11y via Modal wrapper", () => {
    it("closes via Escape key when wrapped in Modal", () => {
        const onClose = vi.fn();
        // Use failed state so the component itself renders a close button
        renderInModal(
            { modalState: modalState.failed("Transaction failed") },
            onClose
        );
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("focuses the first focusable element on open (failed state with close btn)", async () => {
        const onClose = vi.fn();
        renderInModal(
            { modalState: modalState.failed("Transaction failed"), onClose },
            onClose
        );
        await waitFor(() => {
            const closeBtn = screen.getByRole("button", { name: /close modal/i });
            expect(document.activeElement).toBe(closeBtn);
        });
    });

    it("in-flight: Modal Escape still fires onClose (host decides whether to honour it)", () => {
        // The Modal.tsx always fires onClose on Escape regardless of the content
        // component's state.  The host (page-level component) is responsible for
        // deciding whether to honour the close.  This test documents that contract.
        const onClose = vi.fn();
        renderInModal(
            { modalState: modalState.submitting("Broadcasting…") },
            onClose
        );
        fireEvent.keyDown(document, { key: "Escape" });
        // onClose IS called — the host must guard against this
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("exposes role=dialog with aria-modal=true", () => {
        renderInModal();
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("labels the dialog with aria-labelledby=modal-title", () => {
        renderInModal();
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
        const titleEl = document.getElementById("modal-title");
        expect(titleEl?.textContent).toMatch(/creating your raffle|awaiting signature/i);
    });

    it("traps focus: Tab from last element wraps to first (failed state)", async () => {
        const onClose = vi.fn();
        renderInModal(
            { modalState: modalState.failed("Error"), onClose },
            onClose
        );

        await waitFor(() => {
            expect(document.activeElement).not.toBe(document.body);
        });

        const dialog = screen.getByRole("dialog");
        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => !el.hasAttribute("disabled"));

        const lastEl = focusable[focusable.length - 1];
        lastEl.focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
        expect(document.activeElement).toBe(focusable[0]);
    });

    it("traps focus: Shift+Tab from first element wraps to last (failed state)", async () => {
        const onClose = vi.fn();
        renderInModal(
            { modalState: modalState.failed("Error"), onClose },
            onClose
        );

        await waitFor(() => {
            expect(document.activeElement).not.toBe(document.body);
        });

        const dialog = screen.getByRole("dialog");
        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => !el.hasAttribute("disabled"));

        focusable[0].focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    });
});

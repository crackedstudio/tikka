/**
 * RaffleCreatedSuccess.spec.tsx
 *
 * Tests for the RaffleCreatedSuccess modal content component.
 *
 * The component renders inside Modal.tsx in production — focus-trap and
 * Escape-to-close are tested here through the Modal wrapper so we have
 * evidence that the real dialog contract is satisfied.  State and interaction
 * tests run on the bare component (no Modal wrapper) because that is faster
 * and avoids coupling to portal mechanics.
 *
 * react-router Link elements require a router context; we use MemoryRouter.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Modal from "./Modal";
import RaffleCreatedSuccess from "./RaffleCreatedSuccess";
import { modalState } from "./transactionModalState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSuccess(
    props: Partial<React.ComponentProps<typeof RaffleCreatedSuccess>> = {}
) {
    return render(
        <MemoryRouter>
            <RaffleCreatedSuccess {...props} />
        </MemoryRouter>
    );
}

function renderInModal(
    props: Partial<React.ComponentProps<typeof RaffleCreatedSuccess>> = {},
    onClose = vi.fn()
) {
    return render(
        <MemoryRouter>
            <Modal open={true} onClose={onClose}>
                <RaffleCreatedSuccess onClose={onClose} {...props} />
            </Modal>
        </MemoryRouter>
    );
}

const mockWindowOpen = vi.fn();
const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

beforeEach(() => {
    const modalRoot = document.createElement("div");
    modalRoot.id = "modal-root";
    document.body.appendChild(modalRoot);

    window.open = mockWindowOpen;
    Object.defineProperty(navigator, "clipboard", {
        value: mockClipboard,
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    const modalRoot = document.getElementById("modal-root");
    if (modalRoot) document.body.removeChild(modalRoot);
    mockWindowOpen.mockReset();
    mockClipboard.writeText.mockReset();
});

// ---------------------------------------------------------------------------
// Visibility gate
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — visibility gate", () => {
    it("renders nothing when isVisible=false", () => {
        const { container } = renderSuccess({ isVisible: false });
        expect(container.firstChild).toBeNull();
    });

    it("renders when isVisible=true (default)", () => {
        renderSuccess();
        expect(
            screen.getByTestId("raffle-created-success-modal")
        ).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Success state — heading and structure
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — success state", () => {
    it("renders the 'Raffle Created Successfully!' heading", () => {
        renderSuccess();
        expect(
            screen.getByRole("heading", { name: /raffle created successfully/i })
        ).toBeInTheDocument();
    });

    it("heading has id=modal-title for aria-labelledby wiring", () => {
        renderSuccess();
        const heading = screen.getByRole("heading", {
            name: /raffle created successfully/i,
        });
        expect(heading).toHaveAttribute("id", "modal-title");
    });

    it("shows the network when provided via explicit prop", () => {
        renderSuccess({ network: "testnet" });
        expect(screen.getByText("testnet")).toBeInTheDocument();
    });

    it("shows the network from modalState when provided", () => {
        renderSuccess({
            modalState: modalState.confirmed({ network: "mainnet" }),
        });
        expect(screen.getByText("mainnet")).toBeInTheDocument();
    });

    it("falls back to 'Demo Mode' when no network supplied", () => {
        renderSuccess();
        expect(screen.getByText("Demo Mode")).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Raffle ID
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — raffle ID", () => {
    it("shows the raffle ID when provided", () => {
        renderSuccess({ raffleId: 42 });
        expect(screen.getByText("#42")).toBeInTheDocument();
    });

    it("omits the raffle ID row when raffleId is undefined", () => {
        renderSuccess();
        expect(screen.queryByText(/raffle id/i)).not.toBeInTheDocument();
    });

    it("shows 'View My Raffle' link when raffleId is provided", () => {
        renderSuccess({ raffleId: 7 });
        expect(
            screen.getByRole("link", { name: /view my raffle/i })
        ).toBeInTheDocument();
    });

    it("omits 'View My Raffle' when raffleId is undefined", () => {
        renderSuccess();
        expect(
            screen.queryByRole("link", { name: /view my raffle/i })
        ).not.toBeInTheDocument();
    });

    it("View My Raffle link points to /raffles/:id", () => {
        renderSuccess({ raffleId: 99 });
        const link = screen.getByRole("link", { name: /view my raffle/i });
        expect(link).toHaveAttribute("href", "/raffles/99");
    });
});

// ---------------------------------------------------------------------------
// Transaction hash
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — transaction hash", () => {
    const TX_HASH = "abcdef1234567890abcdef";
    // Truncation: first 6 chars + "…" + last 4 chars
    // "abcdef" + "…" + "cdef"
    const TRUNCATED_DISPLAY = "abcdef…cdef";

    it("shows a truncated transaction hash", () => {
        renderSuccess({ transactionHash: TX_HASH });
        // The component renders the hash as separate React text nodes:
        // "{hash.slice(0,6)}" + "…" + "{hash.slice(-4)}"
        // getByText with exact=false will match a single node containing all the text
        const span = screen.getByText((_, el) =>
            el?.tagName === "SPAN" &&
            (el.textContent?.replace(/\s/g, "") ?? "") === TRUNCATED_DISPLAY
        );
        expect(span).toBeInTheDocument();
    });

    it("shows transaction hash from modalState.referenceId", () => {
        renderSuccess({
            modalState: modalState.confirmed({ referenceId: TX_HASH }),
        });
        const span = screen.getByText((_, el) =>
            el?.tagName === "SPAN" &&
            (el.textContent?.replace(/\s/g, "") ?? "") === TRUNCATED_DISPLAY
        );
        expect(span).toBeInTheDocument();
    });

    it("omits transaction hash row when no hash is provided", () => {
        renderSuccess();
        expect(
            screen.queryByText(/transaction hash/i)
        ).not.toBeInTheDocument();
    });

    it("copies the tx hash to clipboard when copy button is clicked", async () => {
        renderSuccess({ transactionHash: TX_HASH });
        fireEvent.click(
            screen.getByRole("button", { name: /copy transaction hash/i })
        );
        await waitFor(() => {
            expect(mockClipboard.writeText).toHaveBeenCalledWith(TX_HASH);
        });
    });

    it("does not render the copy button when there is no tx hash", () => {
        renderSuccess();
        expect(
            screen.queryByRole("button", { name: /copy transaction hash/i })
        ).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Explorer link
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — explorer link", () => {
    const TX_HASH = "abc123";

    it("renders 'View on Explorer' button when tx hash is present", () => {
        renderSuccess({ transactionHash: TX_HASH });
        expect(
            screen.getByRole("button", { name: /view on explorer/i })
        ).toBeInTheDocument();
    });

    it("opens the testnet explorer URL for non-mainnet networks", () => {
        renderSuccess({ transactionHash: TX_HASH, network: "testnet" });
        fireEvent.click(
            screen.getByRole("button", { name: /view on explorer/i })
        );
        expect(mockWindowOpen).toHaveBeenCalledWith(
            `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`,
            "_blank"
        );
    });

    it("opens the mainnet explorer URL when network is 'mainnet'", () => {
        renderSuccess({ transactionHash: TX_HASH, network: "mainnet" });
        fireEvent.click(
            screen.getByRole("button", { name: /view on explorer/i })
        );
        expect(mockWindowOpen).toHaveBeenCalledWith(
            `https://stellar.expert/explorer/public/tx/${TX_HASH}`,
            "_blank"
        );
    });

    it("omits the explorer button when no tx hash is provided", () => {
        renderSuccess();
        expect(
            screen.queryByRole("button", { name: /view on explorer/i })
        ).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Create Another Raffle link
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — Create Another Raffle link", () => {
    it("always renders 'Create Another Raffle'", () => {
        renderSuccess();
        expect(
            screen.getByRole("link", { name: /create another raffle/i })
        ).toBeInTheDocument();
    });

    it("Create Another Raffle link points to /create", () => {
        renderSuccess();
        const link = screen.getByRole("link", { name: /create another raffle/i });
        expect(link).toHaveAttribute("href", "/create");
    });
});

// ---------------------------------------------------------------------------
// Close button
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — close button", () => {
    it("renders the close button when onClose is provided", () => {
        renderSuccess({ onClose: vi.fn() });
        expect(
            screen.getByRole("button", { name: /close modal/i })
        ).toBeInTheDocument();
    });

    it("omits the close button when onClose is not provided", () => {
        renderSuccess({ onClose: undefined });
        expect(
            screen.queryByRole("button", { name: /close modal/i })
        ).not.toBeInTheDocument();
    });

    it("calls onClose when the close button is clicked", () => {
        const onClose = vi.fn();
        renderSuccess({ onClose });
        fireEvent.click(screen.getByRole("button", { name: /close modal/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// Focus management and Escape-to-close (via Modal wrapper)
// ---------------------------------------------------------------------------

describe("RaffleCreatedSuccess — a11y via Modal wrapper", () => {
    it("closes via Escape key when wrapped in Modal", () => {
        const onClose = vi.fn();
        renderInModal({}, onClose);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("focuses the first focusable element on open", async () => {
        const onClose = vi.fn();
        renderInModal({ onClose }, onClose);

        await waitFor(() => {
            const closeBtn = screen.getByRole("button", { name: /close modal/i });
            expect(document.activeElement).toBe(closeBtn);
        });
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
        expect(titleEl?.textContent).toMatch(/raffle created successfully/i);
    });

    it("traps focus: Tab from last element wraps to first", async () => {
        const onClose = vi.fn();
        renderInModal({ raffleId: 1, transactionHash: "abc123" }, onClose);

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

    it("traps focus: Shift+Tab from first element wraps to last", async () => {
        const onClose = vi.fn();
        renderInModal({ raffleId: 1, transactionHash: "abc123" }, onClose);

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

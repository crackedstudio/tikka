/**
 * WinnerAnnouncement.spec.tsx
 *
 * Tests for WinnerAnnouncement and its extracted sub-components
 * (AnimationPanel, ResultPanel).
 *
 * Strategy
 * ────────
 * The content component is NOT a dialog itself — it is designed to be placed
 * inside Modal.tsx, which owns the dialog role, focus trap, and Escape
 * handling.  Focus-trap and Escape-to-close are therefore tested here via
 * the Modal wrapper (which needs a `modal-root` DOM node to portal into).
 * The visual states are tested on the bare component/sub-components without
 * the wrapper, which is faster and avoids coupling.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Modal from "./Modal";
import WinnerAnnouncement, {
    AnimationPanel,
    ResultPanel,
} from "./WinnerAnnouncement";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// canvas-confetti is a fire-and-forget side effect — mock the whole module so
// the interval timers don't bleed into other tests.
vi.mock("canvas-confetti", () => ({
    default: Object.assign(vi.fn(), { reset: vi.fn() }),
}));

const mockWindowOpen = vi.fn();

beforeEach(() => {
    // modal-root is required by Modal.tsx's createPortal
    const modalRoot = document.createElement("div");
    modalRoot.id = "modal-root";
    document.body.appendChild(modalRoot);

    window.open = mockWindowOpen;
});

afterEach(() => {
    const modalRoot = document.getElementById("modal-root");
    if (modalRoot) document.body.removeChild(modalRoot);
    mockWindowOpen.mockReset();
    vi.clearAllTimers();
});

// ---------------------------------------------------------------------------
// Default props helpers
// ---------------------------------------------------------------------------

const defaultProps = {
    onClose: vi.fn(),
    onClaimPrize: vi.fn(),
    onBackToHome: vi.fn(),
    prizeName: "Lamborghini Aventador",
    prizeValue: "$500,000",
    walletAddress: "0x330cd8fec...8b7c",
};

// ---------------------------------------------------------------------------
// AnimationPanel
// ---------------------------------------------------------------------------

describe("AnimationPanel", () => {
    it("renders nothing — it is a pure side-effect component", () => {
        const { container } = render(<AnimationPanel isVisible={true} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders nothing when isVisible=false", () => {
        const { container } = render(<AnimationPanel isVisible={false} />);
        expect(container.firstChild).toBeNull();
    });

    it("skips confetti when prefers-reduced-motion is set", async () => {
        // Override the matchMedia stub to return matches=true for this test
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: (_query: string) => ({
                matches: true, // prefers-reduced-motion: reduce
                media: _query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
            }),
        });

        const confetti = (await import("canvas-confetti")).default;
        render(<AnimationPanel isVisible={true} />);

        // Wait a tick to confirm no confetti was fired
        await new Promise((r) => setTimeout(r, 20));
        expect(confetti).not.toHaveBeenCalled();

        // Restore stub (setupTests.ts default: matches=false)
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: (_query: string) => ({
                matches: false,
                media: _query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
            }),
        });
    });
});

// ---------------------------------------------------------------------------
// ResultPanel — rendering states
// ---------------------------------------------------------------------------

describe("ResultPanel — rendering", () => {
    it("shows the prize name", () => {
        render(<ResultPanel {...defaultProps} />);
        expect(
            screen.getByText("Lamborghini Aventador")
        ).toBeInTheDocument();
    });

    it("shows the prize value", () => {
        render(<ResultPanel {...defaultProps} />);
        expect(screen.getByText("$500,000")).toBeInTheDocument();
    });

    it("shows the wallet address", () => {
        render(<ResultPanel {...defaultProps} />);
        expect(
            screen.getByText("0x330cd8fec...8b7c")
        ).toBeInTheDocument();
    });

    it("renders the 'You Won!' heading with id=modal-title", () => {
        render(<ResultPanel {...defaultProps} />);
        const heading = screen.getByRole("heading", { name: /you won/i });
        expect(heading).toBeInTheDocument();
        expect(heading).toHaveAttribute("id", "modal-title");
    });

    it("renders the Claim Your Prize button", () => {
        render(<ResultPanel {...defaultProps} />);
        expect(
            screen.getByRole("button", { name: /claim your prize/i })
        ).toBeInTheDocument();
    });

    it("renders all four social-share buttons with accessible labels", () => {
        render(<ResultPanel {...defaultProps} />);
        const platforms = ["Twitter", "Facebook", "WhatsApp", "Telegram"];
        for (const p of platforms) {
            expect(
                screen.getByRole("button", { name: new RegExp(`share on ${p}`, "i") })
            ).toBeInTheDocument();
        }
    });

    it("renders the Back to Home button", () => {
        render(<ResultPanel {...defaultProps} />);
        expect(
            screen.getByRole("button", { name: /back to home/i })
        ).toBeInTheDocument();
    });

    it("renders the Close modal button with an accessible label", () => {
        render(<ResultPanel {...defaultProps} />);
        expect(
            screen.getByRole("button", { name: /close modal/i })
        ).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// ResultPanel — interactions
// ---------------------------------------------------------------------------

describe("ResultPanel — interactions", () => {
    it("calls onClose when the close button is clicked", () => {
        const onClose = vi.fn();
        render(<ResultPanel {...defaultProps} onClose={onClose} />);
        fireEvent.click(screen.getByRole("button", { name: /close modal/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClaimPrize when Claim Your Prize is clicked", () => {
        const onClaimPrize = vi.fn();
        render(<ResultPanel {...defaultProps} onClaimPrize={onClaimPrize} />);
        fireEvent.click(
            screen.getByRole("button", { name: /claim your prize/i })
        );
        expect(onClaimPrize).toHaveBeenCalledTimes(1);
    });

    it("calls onBackToHome when Back to Home is clicked", () => {
        const onBackToHome = vi.fn();
        render(<ResultPanel {...defaultProps} onBackToHome={onBackToHome} />);
        fireEvent.click(screen.getByRole("button", { name: /back to home/i }));
        expect(onBackToHome).toHaveBeenCalledTimes(1);
    });

    it("opens a new window when a social-share button is clicked", () => {
        render(<ResultPanel {...defaultProps} />);
        fireEvent.click(
            screen.getByRole("button", { name: /share on twitter/i })
        );
        expect(mockWindowOpen).toHaveBeenCalledTimes(1);
        const [url, target] = mockWindowOpen.mock.calls[0];
        expect(url).toContain("twitter.com/intent/tweet");
        expect(target).toBe("_blank");
    });

    it("includes the prize name in the social-share text for Twitter", () => {
        render(
            <ResultPanel
                {...defaultProps}
                prizeName="Golden Ticket"
                prizeValue="$1000"
            />
        );
        fireEvent.click(
            screen.getByRole("button", { name: /share on twitter/i })
        );
        const [url] = mockWindowOpen.mock.calls[0];
        expect(decodeURIComponent(url)).toContain("Golden Ticket");
    });
});

// ---------------------------------------------------------------------------
// WinnerAnnouncement (orchestrator)
// ---------------------------------------------------------------------------

describe("WinnerAnnouncement — visibility gate", () => {
    it("renders nothing when isVisible=false", () => {
        const { container } = render(
            <WinnerAnnouncement {...defaultProps} isVisible={false} />
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders the result panel when isVisible=true", () => {
        render(<WinnerAnnouncement {...defaultProps} isVisible={true} />);
        expect(
            screen.getByRole("heading", { name: /you won/i })
        ).toBeInTheDocument();
    });

    it("uses default prop values when none are supplied", () => {
        render(<WinnerAnnouncement onClose={vi.fn()} />);
        expect(
            screen.getByText("Lamborghini Aventador, Limited Edition 2023")
        ).toBeInTheDocument();
        expect(screen.getByText("$500,000")).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Focus management and Escape-to-close (via Modal wrapper)
// ---------------------------------------------------------------------------

describe("WinnerAnnouncement — a11y via Modal wrapper", () => {
    it("focuses the first focusable element when the modal opens", async () => {
        const onClose = vi.fn();
        render(
            <Modal open={true} onClose={onClose}>
                <WinnerAnnouncement {...defaultProps} onClose={onClose} />
            </Modal>
        );

        // Modal focuses the first focusable child after a 10 ms timer
        await waitFor(() => {
            const closeBtn = screen.getByRole("button", { name: /close modal/i });
            expect(document.activeElement).toBe(closeBtn);
        });
    });

    it("closes via Escape key when wrapped in Modal", () => {
        const onClose = vi.fn();
        render(
            <Modal open={true} onClose={onClose}>
                <WinnerAnnouncement {...defaultProps} onClose={onClose} />
            </Modal>
        );
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("wraps focus from last to first focusable element on Tab", async () => {
        const onClose = vi.fn();
        render(
            <Modal open={true} onClose={onClose}>
                <WinnerAnnouncement {...defaultProps} onClose={onClose} />
            </Modal>
        );

        // Wait for initial focus to be applied
        await waitFor(() => {
            expect(document.activeElement).not.toBe(document.body);
        });

        // Collect all focusable elements inside the dialog
        const dialog = screen.getByRole("dialog");
        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => !el.hasAttribute("disabled"));

        const lastEl = focusable[focusable.length - 1];
        lastEl.focus();
        expect(document.activeElement).toBe(lastEl);

        // Tab from last element should wrap back to first
        fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
        expect(document.activeElement).toBe(focusable[0]);
    });

    it("wraps focus from first to last focusable element on Shift+Tab", async () => {
        const onClose = vi.fn();
        render(
            <Modal open={true} onClose={onClose}>
                <WinnerAnnouncement {...defaultProps} onClose={onClose} />
            </Modal>
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

        const firstEl = focusable[0];
        firstEl.focus();

        // Shift+Tab from first element should wrap to last
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    });

    it("exposes role=dialog and aria-modal=true", () => {
        const onClose = vi.fn();
        render(
            <Modal open={true} onClose={onClose}>
                <WinnerAnnouncement {...defaultProps} onClose={onClose} />
            </Modal>
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("labels the dialog via aria-labelledby pointing at modal-title", () => {
        const onClose = vi.fn();
        render(
            <Modal open={true} onClose={onClose}>
                <WinnerAnnouncement {...defaultProps} onClose={onClose} />
            </Modal>
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
        // The referenced element must exist and contain the heading text
        const titleEl = document.getElementById("modal-title");
        expect(titleEl).not.toBeNull();
        expect(titleEl?.textContent).toMatch(/you won/i);
    });
});

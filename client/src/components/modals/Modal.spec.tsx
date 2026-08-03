/**
 * Modal.spec.tsx
 *
 * Unit tests for the base Modal component accessibility features.
 * Tests keyboard handling and ARIA attributes.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "./Modal";

describe("Modal accessibility", () => {
    it("closes when Escape key is pressed", () => {
        const onClose = vi.fn();

        render(
            <Modal open={true} onClose={onClose}>
                <div>
                    <h2 id="modal-title">Test Modal</h2>
                    <button>Action</button>
                </div>
            </Modal>
        );

        // Modal should be visible
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeInTheDocument();

        // Press Escape key
        fireEvent.keyDown(document, { key: "Escape" });

        // onClose should be called
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

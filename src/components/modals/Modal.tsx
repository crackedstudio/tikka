import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
    open: boolean;
    onClose: () => void;
    children?: React.ReactNode;
};

export default function Modal({ open, onClose, children }: ModalProps) {
    const root =
        typeof window !== "undefined"
            ? document.getElementById("modal-root")
            : null;
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const lastFocusedRef = useRef<HTMLElement | null>(null);

    // prevent page scroll when modal is open
    useEffect(() => {
        if (!open) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = original;
        };
    }, [open]);

    // save/restore focus and focus first focusable inside modal
    useEffect(() => {
        if (!open) return;
        lastFocusedRef.current = document.activeElement as HTMLElement;
        // focus modal container after open
        const timer = setTimeout(() => {
            const node = dialogRef.current;
            if (!node) return;
            const focusable = node.querySelector<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            (focusable ?? node).focus();
        }, 10);
        return () => {
            clearTimeout(timer);
            lastFocusedRef.current?.focus?.();
        };
    }, [open]);

    // close on ESC
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            // simple tab trap
            if (e.key === "Tab") {
                const node = dialogRef.current;
                if (!node) return;
                const focusable = Array.from(
                    node.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    )
                ).filter(
                    (el) =>
                        !el.hasAttribute("disabled") && el.offsetParent !== null
                );
                if (focusable.length === 0) {
                    e.preventDefault();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                } else if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!root || !open) return null;

    return createPortal(
        <div
            aria-hidden={!open}
            className={`fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-6`}
        >
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/85 transition-opacity ${
                    open ? "opacity-100" : "opacity-0"
                }`}
                onMouseDown={onClose} // click outside closes
            />

            {/* Dialog box */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={"modal-title"}
                ref={dialogRef}
                // stop click from bubbling to backdrop
                onMouseDown={(e) => e.stopPropagation()}
                tabIndex={-1}
                className={`relative md:p-6 rounded-xl w-full md:w-[500px] mx-auto transform transition-all ${
                    open
                        ? "opacity-100 translate-y-0 scale-100"
                        : "opacity-0 translate-y-4 scale-95"
                }`}
            >
                <div className="rounded-2xl bg-[#0B1220] border border-[#1F263F] p-6 shadow-xl">
                    <div className="mt-4">{children}</div>
                </div>
            </div>
        </div>,
        root
    );
}

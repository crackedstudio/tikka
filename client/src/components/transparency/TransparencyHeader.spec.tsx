import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TransparencyHeader from "./TransparencyHeader";

const renderHeader = () =>
    render(
        <MemoryRouter>
            <TransparencyHeader />
        </MemoryRouter>
    );

describe("TransparencyHeader", () => {
    it("renders the page heading", () => {
        renderHeader();
        expect(
            screen.getByRole("heading", { name: /transparency/i })
        ).toBeInTheDocument();
    });

    it("renders a link to the verify-published-draw script", () => {
        renderHeader();
        const link = screen.getByRole("link", { name: /verify-published-draw/i });
        expect(link).toHaveAttribute(
            "href",
            expect.stringContaining("verify-published-draw.ts")
        );
    });

    it("renders a link to the randomness scheme document", () => {
        renderHeader();
        const link = screen.getByRole("link", { name: /randomness scheme/i });
        expect(link).toHaveAttribute(
            "href",
            expect.stringContaining("RANDOMNESS_SCHEME.md")
        );
    });

    it("mentions the key verification inputs described in RANDOMNESS_SCHEME.md", () => {
        renderHeader();
        // Each term appears somewhere in the rendered text — checked individually
        // because they may live in different DOM nodes.
        expect(screen.getByText(/proof/i)).toBeInTheDocument();
        expect(screen.getByText(/seed/i)).toBeInTheDocument();
        expect(screen.getByText(/oracle public key/i)).toBeInTheDocument();
        expect(screen.getByText(/participant list/i)).toBeInTheDocument();
    });
});

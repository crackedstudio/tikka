import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VerifyDrawForm from "./VerifyDrawForm";
import type { VerifyResult } from "./types";

const noop = () => {};

describe("VerifyDrawForm", () => {
    it("renders the heading and audit log link", () => {
        render(
            <VerifyDrawForm
                raffleId=""
                onRaffleIdChange={noop}
                onSubmit={noop}
                verifying={false}
                result={null}
            />
        );
        expect(screen.getByRole("heading", { name: /verify a draw/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /oracle audit log/i })).toHaveAttribute(
            "href",
            "#audit-log"
        );
    });

    it("disables submit when raffleId is empty", () => {
        render(
            <VerifyDrawForm
                raffleId=""
                onRaffleIdChange={noop}
                onSubmit={noop}
                verifying={false}
                result={null}
            />
        );
        expect(screen.getByRole("button", { name: /verify/i })).toBeDisabled();
    });

    it("enables submit when raffleId has content", () => {
        render(
            <VerifyDrawForm
                raffleId="123"
                onRaffleIdChange={noop}
                onSubmit={noop}
                verifying={false}
                result={null}
            />
        );
        expect(screen.getByRole("button", { name: /verify/i })).toBeEnabled();
    });

    it("shows Verifying… label while verifying", () => {
        render(
            <VerifyDrawForm
                raffleId="123"
                onRaffleIdChange={noop}
                onSubmit={noop}
                verifying={true}
                result={null}
            />
        );
        expect(screen.getByRole("button", { name: /verifying/i })).toBeDisabled();
    });

    it("calls onRaffleIdChange when input changes", () => {
        const onChange = vi.fn();
        render(
            <VerifyDrawForm
                raffleId=""
                onRaffleIdChange={onChange}
                onSubmit={noop}
                verifying={false}
                result={null}
            />
        );
        fireEvent.change(screen.getByPlaceholderText(/paste raffle id/i), {
            target: { value: "42" },
        });
        expect(onChange).toHaveBeenCalledWith("42");
    });

    it("calls onSubmit when form is submitted", () => {
        const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
        render(
            <VerifyDrawForm
                raffleId="99"
                onRaffleIdChange={noop}
                onSubmit={onSubmit}
                verifying={false}
                result={null}
            />
        );
        fireEvent.submit(screen.getByRole("button", { name: /verify/i }).closest("form")!);
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("renders success result", () => {
        const result: VerifyResult = { verified: true, proof: "abc123" };
        render(
            <VerifyDrawForm
                raffleId="1"
                onRaffleIdChange={noop}
                onSubmit={noop}
                verifying={false}
                result={result}
            />
        );
        expect(screen.getByText(/valid.*draw result is authentic/i)).toBeInTheDocument();
        expect(screen.getByText(/proof: abc123/i)).toBeInTheDocument();
    });

    it("renders failure result with reason", () => {
        const result: VerifyResult = {
            verified: false,
            proof: "",
            reason: "proof mismatch",
        };
        render(
            <VerifyDrawForm
                raffleId="1"
                onRaffleIdChange={noop}
                onSubmit={noop}
                verifying={false}
                result={result}
            />
        );
        expect(screen.getByText(/invalid.*proof mismatch/i)).toBeInTheDocument();
    });

    it("renders failure result with default reason when reason is absent", () => {
        const result: VerifyResult = { verified: false, proof: "" };
        render(
            <VerifyDrawForm
                raffleId="1"
                onRaffleIdChange={noop}
                onSubmit={noop}
                verifying={false}
                result={result}
            />
        );
        expect(screen.getByText(/invalid.*verification failed/i)).toBeInTheDocument();
    });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AuditLogTable from "./AuditLogTable";
import type { AuditLogEntry } from "./types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeEntry = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
    id: "entry-1",
    timestamp: new Date("2024-01-15T10:00:00Z").toISOString(),
    raffle_id: 7,
    request_id: "req-abc123def456",
    oracle_id: "oracle-node-1",
    proof: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    seed: "deadbeefcafebabe",
    tx_hash: "TXHASHSTELLAR0001",
    method: "VRF",
    ...overrides,
});

const defaultProps = {
    entries: [],
    total: 0,
    page: 0,
    onPageChange: vi.fn(),
    raffleFilter: "",
    onRaffleFilterChange: vi.fn(),
    loading: false,
    error: null,
    expanded: null,
    onToggleExpand: vi.fn(),
    onVerifyFromRow: vi.fn(),
};

const renderTable = (overrides = {}) =>
    render(<AuditLogTable {...defaultProps} {...overrides} />);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AuditLogTable", () => {
    describe("empty / loading / error states", () => {
        it("shows loading indicator", () => {
            renderTable({ loading: true });
            expect(screen.getByText(/loading/i)).toBeInTheDocument();
        });

        it("shows error message", () => {
            renderTable({ error: "Network error" });
            expect(screen.getByText("Network error")).toBeInTheDocument();
        });

        it("shows empty state when no entries", () => {
            renderTable({ entries: [], total: 0 });
            expect(screen.getByText(/no audit entries found/i)).toBeInTheDocument();
        });
    });

    describe("table rows", () => {
        it("renders one row per entry", () => {
            const entries = [makeEntry({ id: "1" }), makeEntry({ id: "2" })];
            renderTable({ entries, total: 2 });
            // Two Details buttons
            expect(screen.getAllByRole("button", { name: /details/i })).toHaveLength(2);
        });

        it("shows raffle ID prefixed with #", () => {
            renderTable({ entries: [makeEntry({ raffle_id: 42 })], total: 1 });
            expect(screen.getByText("#42")).toBeInTheDocument();
        });

        it("shows VRF badge in purple", () => {
            renderTable({ entries: [makeEntry({ method: "VRF" })], total: 1 });
            const badge = screen.getByText("VRF");
            expect(badge.className).toMatch(/purple/);
        });

        it("shows PRNG badge in blue", () => {
            renderTable({ entries: [makeEntry({ method: "PRNG" })], total: 1 });
            const badge = screen.getByText("PRNG");
            expect(badge.className).toMatch(/blue/);
        });

        it("truncates request_id in the row", () => {
            const entry = makeEntry({ request_id: "req-abc123def456ghijklmn" });
            renderTable({ entries: [entry], total: 1 });
            // request_id is longer than 20 chars so it gets truncated
            expect(screen.getByText(/req-abc123def456gh…/)).toBeInTheDocument();
        });

        it("calls onToggleExpand when Details button is clicked", () => {
            const onToggleExpand = vi.fn();
            renderTable({
                entries: [makeEntry({ id: "entry-1" })],
                total: 1,
                onToggleExpand,
            });
            fireEvent.click(screen.getByRole("button", { name: /details/i }));
            expect(onToggleExpand).toHaveBeenCalledWith("entry-1");
        });
    });

    describe("expanded detail panel", () => {
        it("shows all documented scheme fields when expanded", () => {
            const entry = makeEntry();
            renderTable({
                entries: [entry],
                total: 1,
                expanded: "entry-1",
            });
            expect(screen.getByText(/oracle id/i)).toBeInTheDocument();
            expect(screen.getByText(/request id/i)).toBeInTheDocument();
            expect(screen.getByText(/seed \(hex\)/i)).toBeInTheDocument();
            expect(screen.getByText(/proof \(hex\)/i)).toBeInTheDocument();
            expect(screen.getByText(/tx hash/i)).toBeInTheDocument();
        });

        it("shows full seed value in detail panel", () => {
            const entry = makeEntry({ seed: "deadbeefcafebabe" });
            renderTable({ entries: [entry], total: 1, expanded: "entry-1" });
            expect(screen.getByText("deadbeefcafebabe")).toBeInTheDocument();
        });

        it("calls onVerifyFromRow with raffle_id when Verify this draw is clicked", () => {
            const onVerifyFromRow = vi.fn();
            const entry = makeEntry({ raffle_id: 7 });
            renderTable({
                entries: [entry],
                total: 1,
                expanded: "entry-1",
                onVerifyFromRow,
            });
            fireEvent.click(screen.getByRole("button", { name: /verify this draw/i }));
            expect(onVerifyFromRow).toHaveBeenCalledWith(7);
        });

        it("shows Hide button when entry is expanded", () => {
            renderTable({ entries: [makeEntry()], total: 1, expanded: "entry-1" });
            expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
        });
    });

    describe("filter bar", () => {
        it("calls onRaffleFilterChange when filter input changes", () => {
            const onRaffleFilterChange = vi.fn();
            renderTable({ onRaffleFilterChange });
            fireEvent.change(screen.getByPlaceholderText(/filter by raffle id/i), {
                target: { value: "5" },
            });
            expect(onRaffleFilterChange).toHaveBeenCalledWith("5");
        });

        it("shows Clear button when raffleFilter is set", () => {
            renderTable({ raffleFilter: "3" });
            expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
        });

        it("hides Clear button when raffleFilter is empty", () => {
            renderTable({ raffleFilter: "" });
            expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
        });

        it("shows total entry count", () => {
            renderTable({ entries: [makeEntry()], total: 250 });
            expect(screen.getByText(/250 total entries/i)).toBeInTheDocument();
        });
    });

    describe("pagination", () => {
        it("does not render pagination when only one page", () => {
            renderTable({ entries: [makeEntry()], total: 1 });
            expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
        });

        it("renders pagination when total exceeds PAGE_SIZE", () => {
            renderTable({
                entries: Array.from({ length: 20 }, (_, i) =>
                    makeEntry({ id: String(i) })
                ),
                total: 50,
                page: 0,
            });
            expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
        });

        it("disables Previous on first page", () => {
            renderTable({
                entries: Array.from({ length: 20 }, (_, i) =>
                    makeEntry({ id: String(i) })
                ),
                total: 50,
                page: 0,
            });
            expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
        });

        it("disables Next on last page", () => {
            renderTable({
                entries: Array.from({ length: 10 }, (_, i) =>
                    makeEntry({ id: String(i) })
                ),
                total: 50,
                page: 2, // ceil(50/20) - 1 = 2
            });
            expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
        });

        it("calls onPageChange with decremented page when Previous clicked", () => {
            const onPageChange = vi.fn();
            renderTable({
                entries: Array.from({ length: 20 }, (_, i) =>
                    makeEntry({ id: String(i) })
                ),
                total: 50,
                page: 1,
                onPageChange,
            });
            fireEvent.click(screen.getByRole("button", { name: /previous/i }));
            expect(onPageChange).toHaveBeenCalledWith(0);
        });

        it("calls onPageChange with incremented page when Next clicked", () => {
            const onPageChange = vi.fn();
            renderTable({
                entries: Array.from({ length: 20 }, (_, i) =>
                    makeEntry({ id: String(i) })
                ),
                total: 50,
                page: 0,
                onPageChange,
            });
            fireEvent.click(screen.getByRole("button", { name: /next/i }));
            expect(onPageChange).toHaveBeenCalledWith(1);
        });
    });
});

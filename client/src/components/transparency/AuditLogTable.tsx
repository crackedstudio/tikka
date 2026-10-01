// Audit log table, draw detail panel, filter bar, and pagination controls.
// Rendered fields cross-checked against docs/RANDOMNESS_SCHEME.md:
//   - oracle_id  : the oracle node identifier
//   - request_id : the randomness request identifier (VRF input prefix)
//   - seed       : SHA-256(proof) for VRF; SHA-256(request_id||raffle_id_u32_be) for PRNG
//   - proof      : Ed25519 sig (VRF) or double-SHA-256 preimage (PRNG)
//   - tx_hash    : on-chain transaction that called receive_randomness

import { Fragment } from "react";
import type { AuditLogEntry } from "./types";
import { truncate, PAGE_SIZE } from "./types";

// ── Detail row ─────────────────────────────────────────────────────────────────

const Detail = ({ label, value }: { label: string; value: string }) => (
    <div className="flex gap-3 items-start">
        <span className="text-gray-500 w-28 shrink-0">{label}:</span>
        <span className="text-gray-700 dark:text-gray-300 break-all">{value}</span>
    </div>
);

// ── Props ──────────────────────────────────────────────────────────────────────

interface AuditLogTableProps {
    entries: AuditLogEntry[];
    total: number;
    page: number;
    onPageChange: (page: number) => void;
    raffleFilter: string;
    onRaffleFilterChange: (value: string) => void;
    loading: boolean;
    error: string | null;
    expanded: string | null;
    onToggleExpand: (id: string) => void;
    /** Called when the user clicks "Verify this draw" inside an expanded row */
    onVerifyFromRow: (raffleId: number) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

const AuditLogTable = ({
    entries,
    total,
    page,
    onPageChange,
    raffleFilter,
    onRaffleFilterChange,
    loading,
    error,
    expanded,
    onToggleExpand,
    onVerifyFromRow,
}: AuditLogTableProps) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <>
            {/* Filter bar */}
            <div className="flex gap-3 items-center">
                <input
                    id="audit-log-filter"
                    type="number"
                    placeholder="Filter by Raffle ID"
                    value={raffleFilter}
                    onChange={(e) => {
                        onRaffleFilterChange(e.target.value);
                        onPageChange(0);
                    }}
                    className="bg-white dark:bg-[#11172E] text-gray-900 dark:text-white placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-2 text-sm w-48 focus:outline-none focus:border-pink-500 dark:border-[#FF389C]"
                />
                {raffleFilter && (
                    <button
                        onClick={() => {
                            onRaffleFilterChange("");
                            onPageChange(0);
                        }}
                        className="text-gray-400 hover:text-gray-900 dark:text-white text-sm"
                    >
                        Clear
                    </button>
                )}
                <span className="text-gray-500 text-sm ml-auto">
                    {total} total entries
                </span>
            </div>

            {/* Table */}
            <div
                id="audit-log"
                className="bg-white dark:bg-[#11172E] rounded-3xl overflow-hidden scroll-mt-24"
            >
                {loading && (
                    <div className="p-8 text-center text-gray-400 text-sm animate-pulse">
                        Loading…
                    </div>
                )}
                {error && (
                    <div className="p-8 text-center text-red-400 text-sm">
                        {error}
                    </div>
                )}
                {!loading && !error && entries.length === 0 && (
                    <div className="p-8 text-center text-gray-500 text-sm">
                        No audit entries found.
                    </div>
                )}
                {!loading && !error && entries.length > 0 && (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-400 border-b border-gray-800 text-left">
                                <th className="px-6 py-4 font-medium">Timestamp</th>
                                <th className="px-4 py-4 font-medium">Raffle</th>
                                <th className="px-4 py-4 font-medium">Method</th>
                                <th className="px-4 py-4 font-medium">Request ID</th>
                                <th className="px-4 py-4 font-medium">Tx Hash</th>
                                <th className="px-4 py-4 font-medium" />
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => (
                                <Fragment key={entry.id}>
                                    <tr className="border-b border-gray-800 hover:bg-gray-100 dark:bg-[#161d38] transition-colors">
                                        <td className="px-6 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                            {new Date(entry.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-gray-900 dark:text-white font-mono">
                                            #{entry.raffle_id}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    entry.method === "VRF"
                                                        ? "bg-purple-900 text-purple-300"
                                                        : "bg-blue-900 text-blue-300"
                                                }`}
                                            >
                                                {entry.method}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 font-mono">
                                            {truncate(entry.request_id, 20)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 font-mono">
                                            {truncate(entry.tx_hash, 20)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() =>
                                                    onToggleExpand(entry.id)
                                                }
                                                className="text-pink-600 dark:text-[#FF389C] hover:underline text-xs"
                                            >
                                                {expanded === entry.id
                                                    ? "Hide"
                                                    : "Details"}
                                            </button>
                                        </td>
                                    </tr>

                                    {expanded === entry.id && (
                                        <tr className="bg-[#0d1225] border-b border-gray-800">
                                            <td colSpan={6} className="px-6 py-4">
                                                <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                                                    {/* Fields per RANDOMNESS_SCHEME.md §2 and §7 */}
                                                    <Detail
                                                        label="Oracle ID"
                                                        value={entry.oracle_id}
                                                    />
                                                    <Detail
                                                        label="Request ID"
                                                        value={entry.request_id}
                                                    />
                                                    <Detail
                                                        label="Seed (hex)"
                                                        value={entry.seed}
                                                    />
                                                    <Detail
                                                        label="Proof (hex)"
                                                        value={entry.proof}
                                                    />
                                                    <Detail
                                                        label="Tx Hash"
                                                        value={entry.tx_hash}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        onVerifyFromRow(
                                                            entry.raffle_id
                                                        );
                                                        window.scrollTo({
                                                            top: 0,
                                                            behavior: "smooth",
                                                        });
                                                    }}
                                                    className="mt-3 text-xs text-pink-600 dark:text-[#FF389C] hover:underline"
                                                >
                                                    ↑ Verify this draw
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    <button
                        disabled={page === 0}
                        onClick={() => onPageChange(page - 1)}
                        className="px-4 py-2 rounded-xl bg-white dark:bg-[#11172E] text-gray-700 dark:text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-gray-400 text-sm">
                        {page + 1} / {totalPages}
                    </span>
                    <button
                        disabled={page >= totalPages - 1}
                        onClick={() => onPageChange(page + 1)}
                        className="px-4 py-2 rounded-xl bg-white dark:bg-[#11172E] text-gray-700 dark:text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100"
                    >
                        Next
                    </button>
                </div>
            )}
        </>
    );
};

export default AuditLogTable;

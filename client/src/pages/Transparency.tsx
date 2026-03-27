import { useState, useEffect, useCallback, Fragment } from "react";
import { api } from "../services/apiClient";
import { API_CONFIG } from "../config/api";

interface AuditLogEntry {
    id: string;
    timestamp: string;
    raffle_id: number;
    request_id: string;
    oracle_id: string;
    seed: string;
    proof: string;
    tx_hash: string;
    method: "VRF" | "PRNG";
}

interface AuditLogResponse {
    entries: AuditLogEntry[];
    total: number;
}

const PAGE_SIZE = 20;

const Transparency = () => {
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [raffleFilter, setRaffleFilter] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(page * PAGE_SIZE),
            });
            if (raffleFilter.trim()) params.set("raffle_id", raffleFilter.trim());

            const data = await api.get<AuditLogResponse>(
                `${API_CONFIG.endpoints.transparency.list}?${params}`
            );
            setEntries(data.entries ?? []);
            setTotal(data.total ?? 0);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to load audit log");
        } finally {
            setLoading(false);
        }
    }, [page, raffleFilter]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const truncate = (s: string, n = 16) =>
        s.length > n ? `${s.slice(0, n)}…` : s;

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col gap-6">
            {/* Header */}
            <div className="bg-[#11172E] rounded-3xl p-8">
                <h1 className="text-3xl font-bold text-white mb-2">
                    Transparency Log
                </h1>
                <p className="text-gray-400 text-sm max-w-2xl">
                    Every oracle reveal result is logged here off-chain for independent
                    verification. Each entry contains the seed, cryptographic proof, and
                    on-chain transaction hash so anyone can confirm the randomness was
                    not manipulated.
                </p>
            </div>

            {/* Filter */}
            <div className="flex gap-3 items-center">
                <input
                    type="number"
                    placeholder="Filter by Raffle ID"
                    value={raffleFilter}
                    onChange={(e) => {
                        setRaffleFilter(e.target.value);
                        setPage(0);
                    }}
                    className="bg-[#11172E] text-white placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-2 text-sm w-48 focus:outline-none focus:border-[#FF389C]"
                />
                {raffleFilter && (
                    <button
                        onClick={() => { setRaffleFilter(""); setPage(0); }}
                        className="text-gray-400 hover:text-white text-sm"
                    >
                        Clear
                    </button>
                )}
                <span className="text-gray-500 text-sm ml-auto">
                    {total} total entries
                </span>
            </div>

            {/* Table */}
            <div className="bg-[#11172E] rounded-3xl overflow-hidden">
                {loading && (
                    <div className="p-8 text-center text-gray-400 text-sm animate-pulse">
                        Loading…
                    </div>
                )}
                {error && (
                    <div className="p-8 text-center text-red-400 text-sm">{error}</div>
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
                                <th className="px-4 py-4 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => (
                                <Fragment key={entry.id}>
                                    <tr className="border-b border-gray-800 hover:bg-[#161d38] transition-colors">
                                        <td className="px-6 py-3 text-gray-300 whitespace-nowrap">
                                            {new Date(entry.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-white font-mono">
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
                                                    setExpanded(
                                                        expanded === entry.id ? null : entry.id
                                                    )
                                                }
                                                className="text-[#FF389C] hover:underline text-xs"
                                            >
                                                {expanded === entry.id ? "Hide" : "Details"}
                                            </button>
                                        </td>
                                    </tr>
                                    {expanded === entry.id && (
                                        <tr className="bg-[#0d1225] border-b border-gray-800">
                                            <td colSpan={6} className="px-6 py-4">
                                                <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                                                    <Detail label="Oracle ID" value={entry.oracle_id} />
                                                    <Detail label="Request ID" value={entry.request_id} />
                                                    <Detail label="Seed (hex)" value={entry.seed} />
                                                    <Detail label="Proof (hex)" value={entry.proof} />
                                                    <Detail label="Tx Hash" value={entry.tx_hash} />
                                                </div>
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
                        onClick={() => setPage((p) => p - 1)}
                        className="px-4 py-2 rounded-xl bg-[#11172E] text-gray-300 text-sm disabled:opacity-40 hover:bg-[#161d38]"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-gray-400 text-sm">
                        {page + 1} / {totalPages}
                    </span>
                    <button
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-4 py-2 rounded-xl bg-[#11172E] text-gray-300 text-sm disabled:opacity-40 hover:bg-[#161d38]"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
    <div className="flex gap-3 items-start">
        <span className="text-gray-500 w-28 shrink-0">{label}:</span>
        <span className="text-gray-300 break-all">{value}</span>
    </div>
);

export default Transparency;

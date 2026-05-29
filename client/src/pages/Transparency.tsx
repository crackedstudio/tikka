import { useState, useEffect, useCallback, Fragment } from "react";
import { api } from "../services/apiClient";
import { API_CONFIG } from "../config/api";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface TransparencyStats {
    total_raffles: number;
    total_tickets: number;
    total_volume_xlm: string;
    prizes_distributed_xlm: string;
    draws_completed: number;
    oracle_public_key: string;
    recent_audit_log: AuditLogEntry[];
}

interface VerifyResult {
    valid: boolean;
    reason?: string;
}

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 30_000;

// ── Sub-components ────────────────────────────────────────────────────────────

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
    <div className="bg-white dark:bg-[#161d38] rounded-2xl p-5 flex flex-col gap-1">
        <span className="text-gray-400 text-xs uppercase tracking-wide">{label}</span>
        <span className="text-gray-900 dark:text-white text-2xl font-bold">{value}</span>
    </div>
);

const StatCardSkeleton = () => (
    <div className="bg-white dark:bg-[#161d38] rounded-2xl p-5 flex flex-col gap-2 animate-pulse">
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
    <div className="flex gap-3 items-start">
        <span className="text-gray-500 w-28 shrink-0">{label}:</span>
        <span className="text-gray-700 dark:text-gray-300 break-all">{value}</span>
    </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const Transparency = () => {
    // Stats
    const [stats, setStats] = useState<TransparencyStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Audit log
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [raffleFilter, setRaffleFilter] = useState("");
    const [logLoading, setLogLoading] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    // Verify form
    const [verifyForm, setVerifyForm] = useState({
        oracle_public_key: "",
        request_id: "",
        proof: "",
        seed: "",
    });
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
    const [verifying, setVerifying] = useState(false);

    // ── Fetch stats ───────────────────────────────────────────────────────────

    const fetchStats = useCallback(async () => {
        try {
            const data = await api.get<TransparencyStats>(
                API_CONFIG.endpoints.transparencyStats
            );
            setStats(data);
            if (data.oracle_public_key) {
                setVerifyForm((f) => ({ ...f, oracle_public_key: data.oracle_public_key }));
            }
        } catch {
            // non-fatal — keep showing stale data
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const id = setInterval(fetchStats, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [fetchStats]);

    // ── Fetch audit log ───────────────────────────────────────────────────────

    const fetchEntries = useCallback(async () => {
        setLogLoading(true);
        setLogError(null);
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
            setLogError(e instanceof Error ? e.message : "Failed to load audit log");
        } finally {
            setLogLoading(false);
        }
    }, [page, raffleFilter]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    // ── Verify handler ────────────────────────────────────────────────────────

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setVerifying(true);
        setVerifyResult(null);
        try {
            const result = await api.post<VerifyResult>(
                API_CONFIG.endpoints.verify,
                verifyForm
            );
            setVerifyResult(result);
        } catch (e: unknown) {
            setVerifyResult({
                valid: false,
                reason: e instanceof Error ? e.message : "Request failed",
            });
        } finally {
            setVerifying(false);
        }
    };

    const copyOracleKey = () => {
        if (!stats?.oracle_public_key) return;
        navigator.clipboard.writeText(stats.oracle_public_key).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const truncate = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n)}…` : s);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col gap-6">
            <div className="-mb-2">
                <Breadcrumbs />
            </div>

            {/* Header */}
            <div className="bg-white dark:bg-[#11172E] rounded-3xl p-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Transparency
                </h1>
                <p className="text-gray-400 text-sm max-w-2xl">
                    Every oracle reveal is logged on-chain. Stats refresh every 30 seconds.
                    Use the verify form to independently confirm any draw result.
                </p>
            </div>

            {/* Live Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
                ) : (
                    <>
                        <StatCard label="Total Raffles" value={stats?.total_raffles ?? "—"} />
                        <StatCard label="Tickets Sold" value={stats?.total_tickets ?? "—"} />
                        <StatCard
                            label="XLM Distributed"
                            value={stats ? `${Number(stats.prizes_distributed_xlm).toLocaleString()} XLM` : "—"}
                        />
                        <StatCard label="Draws Completed" value={stats?.draws_completed ?? "—"} />
                    </>
                )}
            </div>

            {/* Oracle Public Key */}
            <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 flex flex-col gap-2">
                <span className="text-gray-400 text-xs uppercase tracking-wide">
                    Oracle Public Key
                </span>
                {statsLoading ? (
                    <div className="h-5 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                ) : (
                    <div className="flex items-center gap-3">
                        <span className="text-gray-900 dark:text-white font-mono text-sm break-all">
                            {stats?.oracle_public_key || "Not configured"}
                        </span>
                        {stats?.oracle_public_key && (
                            <button
                                onClick={copyOracleKey}
                                className="shrink-0 text-xs px-3 py-1 rounded-lg bg-gray-100 dark:bg-[#161d38] text-gray-600 dark:text-gray-300 hover:text-pink-600 dark:hover:text-[#FF389C] transition-colors"
                            >
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Verify a Draw */}
            <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Verify a Draw
                </h2>
                <form onSubmit={handleVerify} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(
                        [
                            ["oracle_public_key", "Oracle Public Key (hex)"],
                            ["request_id", "Request ID"],
                            ["proof", "Proof (hex)"],
                            ["seed", "Seed (hex)"],
                        ] as const
                    ).map(([field, placeholder]) => (
                        <input
                            key={field}
                            type="text"
                            placeholder={placeholder}
                            value={verifyForm[field]}
                            onChange={(e) =>
                                setVerifyForm((f) => ({ ...f, [field]: e.target.value }))
                            }
                            className="bg-gray-50 dark:bg-[#161d38] text-gray-900 dark:text-white placeholder-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-pink-500 dark:focus:border-[#FF389C]"
                        />
                    ))}
                    <div className="md:col-span-2 flex items-center gap-4">
                        <button
                            type="submit"
                            disabled={verifying}
                            className="px-6 py-2 rounded-xl bg-pink-600 dark:bg-[#FF389C] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                            {verifying ? "Verifying…" : "Verify"}
                        </button>
                        {verifyResult && (
                            <span
                                className={`text-sm font-semibold ${
                                    verifyResult.valid
                                        ? "text-green-500"
                                        : "text-red-400"
                                }`}
                            >
                                {verifyResult.valid
                                    ? "✓ Valid — draw result is authentic"
                                    : `✗ Invalid — ${verifyResult.reason ?? "verification failed"}`}
                            </span>
                        )}
                    </div>
                </form>
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
                    className="bg-white dark:bg-[#11172E] text-gray-900 dark:text-white placeholder-gray-500 border border-gray-700 rounded-xl px-4 py-2 text-sm w-48 focus:outline-none focus:border-pink-500 dark:border-[#FF389C]"
                />
                {raffleFilter && (
                    <button
                        onClick={() => {
                            setRaffleFilter("");
                            setPage(0);
                        }}
                        className="text-gray-400 hover:text-gray-900 dark:text-white text-sm"
                    >
                        Clear
                    </button>
                )}
                <span className="text-gray-500 text-sm ml-auto">{total} total entries</span>
            </div>

            {/* Audit Log Table */}
            <div className="bg-white dark:bg-[#11172E] rounded-3xl overflow-hidden">
                {logLoading && (
                    <div className="p-8 text-center text-gray-400 text-sm animate-pulse">
                        Loading…
                    </div>
                )}
                {logError && (
                    <div className="p-8 text-center text-red-400 text-sm">{logError}</div>
                )}
                {!logLoading && !logError && entries.length === 0 && (
                    <div className="p-8 text-center text-gray-500 text-sm">
                        No audit entries found.
                    </div>
                )}
                {!logLoading && !logError && entries.length > 0 && (
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
                                                    setExpanded(
                                                        expanded === entry.id ? null : entry.id
                                                    )
                                                }
                                                className="text-pink-600 dark:text-[#FF389C] hover:underline text-xs"
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
                                                <button
                                                    onClick={() =>
                                                        setVerifyForm({
                                                            oracle_public_key:
                                                                stats?.oracle_public_key ?? "",
                                                            request_id: entry.request_id,
                                                            proof: entry.proof,
                                                            seed: entry.seed,
                                                        })
                                                    }
                                                    className="mt-3 text-xs text-pink-600 dark:text-[#FF389C] hover:underline"
                                                >
                                                    ↑ Load into verify form
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
                        onClick={() => setPage((p) => p - 1)}
                        className="px-4 py-2 rounded-xl bg-white dark:bg-[#11172E] text-gray-700 dark:text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100 dark:bg-[#161d38]"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-gray-400 text-sm">
                        {page + 1} / {totalPages}
                    </span>
                    <button
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-4 py-2 rounded-xl bg-white dark:bg-[#11172E] text-gray-700 dark:text-gray-300 text-sm disabled:opacity-40 hover:bg-gray-100 dark:bg-[#161d38]"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};

export default Transparency;

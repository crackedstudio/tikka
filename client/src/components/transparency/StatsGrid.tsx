// Live stats grid for the Transparency page.
// Renders four summary cards: Total Raffles, XLM Distributed, Platform Uptime,
// and Most Recent Proof.  Skeleton state is shown while data is loading.
//
// "Most Recent Proof" links to Stellar Expert using the tx_hash of the latest
// audit log entry and displays a truncated form of the proof string — matching
// the documented VRF/PRNG proof fields in docs/RANDOMNESS_SCHEME.md.

import type { TransparencyStats } from "./types";
import { truncate } from "./types";

// ── Primitive building blocks ─────────────────────────────────────────────────

const StatCard = ({
    label,
    value,
}: {
    label: string;
    value: string | number;
}) => (
    <div className="bg-white dark:bg-[#161d38] rounded-2xl p-5 flex flex-col gap-1">
        <span className="text-gray-400 text-xs uppercase tracking-wide">
            {label}
        </span>
        <span className="text-gray-900 dark:text-white text-2xl font-bold">
            {value}
        </span>
    </div>
);

const StatCardSkeleton = () => (
    <div className="bg-white dark:bg-[#161d38] rounded-2xl p-5 flex flex-col gap-2 animate-pulse">
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
);

// ── Main component ────────────────────────────────────────────────────────────

interface StatsGridProps {
    stats: TransparencyStats | null;
    loading: boolean;
}

const StatsGrid = ({ stats, loading }: StatsGridProps) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
                <StatCardSkeleton key={i} />
            ))
        ) : (
            <>
                <StatCard
                    label="Total Raffles"
                    value={stats?.total_raffles ?? "—"}
                />
                <StatCard
                    label="XLM Distributed"
                    value={
                        stats
                            ? `${Number(
                                  stats.prizes_distributed_xlm
                              ).toLocaleString()} XLM`
                            : "—"
                    }
                />
                <StatCard label="Platform Uptime" value="99.99%" />
                {/* Most Recent Proof — links to Stellar Expert via tx_hash;
                    displays the first 12 chars of the proof (VRF signature or
                    PRNG preimage, both hex-encoded per RANDOMNESS_SCHEME.md §2) */}
                <div className="bg-white dark:bg-[#161d38] rounded-2xl p-5 flex flex-col gap-1 overflow-hidden">
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                        Most Recent Proof
                    </span>
                    {stats?.recent_audit_log?.[0] ? (
                        <a
                            href={`https://stellar.expert/explorer/public/tx/${stats.recent_audit_log[0].tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-pink-600 dark:text-[#FF389C] text-lg font-bold hover:underline truncate"
                            title="View on Stellar Expert"
                        >
                            {truncate(stats.recent_audit_log[0].proof, 12)}
                        </a>
                    ) : (
                        <span className="text-gray-900 dark:text-white text-2xl font-bold">
                            —
                        </span>
                    )}
                </div>
            </>
        )}
    </div>
);

export default StatsGrid;

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { useUserProfile, useUserHistory } from "../hooks/useRaffles";
import ErrorMessage from "../components/ui/ErrorMessage";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import type { ApiUserHistoryItem } from "../types/types";

// ── Status badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const s = status.toLowerCase();
    const colour =
        s === "open" ? "text-green-400 bg-green-400/10" :
        s === "finalized" ? "text-blue-400 bg-blue-400/10" :
        s === "cancelled" ? "text-red-400 bg-red-400/10" :
        "text-gray-400 bg-gray-400/10";
    return (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${colour}`}>
            {status}
        </span>
    );
};

// ── History row ───────────────────────────────────────────────────────────────

const HistoryRow: React.FC<{ item: ApiUserHistoryItem }> = ({ item }) => (
    <Link
        to={`/raffles/${item.raffle_id}`}
        className="flex items-center justify-between p-4 bg-white dark:bg-[#1E1932] rounded-xl hover:bg-gray-50 dark:hover:bg-[#2A264A] transition-colors"
    >
        <div className="flex items-center gap-4 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-100 dark:bg-[#2A264A] flex items-center justify-center text-sm font-bold text-gray-900 dark:text-white">
                #{item.raffle_id}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    Raffle #{item.raffle_id}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.tickets_bought} ticket{item.tickets_bought !== 1 ? "s" : ""}
                </p>
            </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
            {item.is_winner && (
                <span className="text-xs font-semibold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                    🏆 Won
                </span>
            )}
            {item.prize_amount && item.is_winner && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {item.prize_amount} XLM
                </span>
            )}
            <StatusBadge status={item.status} />
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
        </div>
    </Link>
);

// ── Pagination ────────────────────────────────────────────────────────────────

const Pagination: React.FC<{
    page: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
}> = ({ page, totalPages, hasPrev, hasNext, onPrev, onNext }) => (
    <div className="flex items-center justify-center gap-4 mt-6">
        <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-[#2A264A] text-gray-900 dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-[#3A365A] transition-colors"
        >
            ← Previous
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page + 1} of {totalPages}
        </span>
        <button
            onClick={onNext}
            disabled={!hasNext}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-[#2A264A] text-gray-900 dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-[#3A365A] transition-colors"
        >
            Next →
        </button>
    </div>
);


// ── Stats bar ─────────────────────────────────────────────────────────────────

const StatItem: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="text-center">
        <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
    { id: "participated", label: "Participated" },
    { id: "created", label: "Created" },
    { id: "won", label: "Won" },
] as const;

type TabId = typeof TABS[number]["id"];

const MyRaffles: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabId>("participated");
    const { address, isConnected, connect, isConnecting } = useWallet();

    const { profile, isLoading: profileLoading } = useUserProfile(address);
    const {
        items: historyItems,
        total: historyTotal,
        page,
        totalPages,
        hasPrev,
        hasNext,
        goToPage,
        isLoading: historyLoading,
        error: historyError,
    } = useUserHistory(address);

    // ── Unauthenticated state ─────────────────────────────────────────────────
    if (!isConnected || !address) {
        return (
            <div className="min-h-screen text-gray-900 dark:text-white">
                <div className="w-full max-w-7xl mx-auto px-6 py-8">
                    <div className="mb-4">
                        <Breadcrumbs />
                    </div>
                    <div className="text-center py-24">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-[#2A264A] rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M17 9V7a5 5 0 00-10 0v2M5 9h14l1 12H4L5 9z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Connect your wallet
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
                            Connect your Stellar wallet to view your created and participated raffles.
                        </p>
                        <button
                            onClick={connect}
                            disabled={isConnecting}
                            className="bg-[#FF389C] hover:bg-[#FF389C]/90 disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-medium transition-colors"
                        >
                            {isConnecting ? "Connecting…" : "Connect Wallet"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Derived lists ─────────────────────────────────────────────────────────
    const participatedItems = historyItems;
    const wonItems = historyItems.filter((i) => i.is_winner);

    // Created raffles: derive from profile — we use the history raffle_ids where
    // the user is the creator. Since the indexer history endpoint doesn't expose
    // "created" directly, we show a prompt to use the creator filter on /raffles.
    // The profile gives us aggregate stats; the history gives participated items.

    // ── Tab content ───────────────────────────────────────────────────────────
    const renderTabContent = () => {
        if (activeTab === "created") {
            return (
                <div className="text-center py-16">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                        Browse all raffles you created on the explore page.
                    </p>
                    <Link
                        to={`/search?creator=${encodeURIComponent(address)}`}
                        className="inline-block bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-xl font-medium transition-colors"
                    >
                        View My Created Raffles
                    </Link>
                </div>
            );
        }

        const displayItems = activeTab === "won" ? wonItems : participatedItems;

        if (historyLoading) {
            return (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 bg-gray-100 dark:bg-[#1E1932] rounded-xl animate-pulse" />
                    ))}
                </div>
            );
        }

        if (historyError) {
            return (
                <ErrorMessage
                    title="Failed to load history"
                    message={historyError.message}
                    onRetry={() => goToPage(page)}
                />
            );
        }

        if (displayItems.length === 0) {
            return (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-[#2A264A] rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd"
                                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                clipRule="evenodd" />
                        </svg>
                    </div>
                    <h3 className="text-gray-900 dark:text-white font-semibold mb-2">
                        {activeTab === "won" ? "No wins yet" : "No history yet"}
                    </h3>
                    <p className="text-gray-400 text-sm mb-6">
                        {activeTab === "won"
                            ? "Keep entering raffles — your first win could be next!"
                            : "You haven't entered any raffles yet."}
                    </p>
                    <Link
                        to="/home"
                        className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-xl font-medium transition-colors"
                    >
                        Browse Raffles
                    </Link>
                </div>
            );
        }

        return (
            <>
                <div className="space-y-3">
                    {displayItems.map((item) => (
                        <HistoryRow key={`${item.raffle_id}-${item.purchase_tx_hash}`} item={item} />
                    ))}
                </div>
                {activeTab === "participated" && totalPages > 1 && (
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        hasPrev={hasPrev}
                        hasNext={hasNext}
                        onPrev={() => goToPage(page - 1)}
                        onNext={() => goToPage(page + 1)}
                    />
                )}
            </>
        );
    };

    return (
        <div className="min-h-screen text-gray-900 dark:text-white">
            <div className="w-full max-w-4xl mx-auto px-6 py-8">
                <div className="mb-4">
                    <Breadcrumbs />
                </div>

                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        My Raffles
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-mono truncate">
                        {address}
                    </p>
                </div>

                {/* Stats */}
                {!profileLoading && profile && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-6 bg-white dark:bg-[#1E1932] rounded-2xl">
                        <StatItem label="Raffles entered" value={profile.total_raffles_entered} />
                        <StatItem label="Tickets bought" value={profile.total_tickets_bought} />
                        <StatItem label="Raffles won" value={profile.total_raffles_won} />
                        <StatItem label="Prize XLM" value={parseFloat(profile.total_prize_xlm || "0").toFixed(2)} />
                    </div>
                )}
                {profileLoading && (
                    <div className="h-28 bg-white dark:bg-[#1E1932] rounded-2xl animate-pulse mb-8" />
                )}

                {/* Tabs */}
                <div className="flex justify-center gap-1 mb-6">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? "bg-gray-200 dark:bg-[#2A264A] text-gray-900 dark:text-white"
                                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                            }`}
                        >
                            {tab.label}
                            {tab.id === "participated" && historyTotal > 0 && (
                                <span className="ml-1.5 text-xs bg-[#FF389C]/20 text-[#FF389C] px-1.5 py-0.5 rounded-full">
                                    {historyTotal}
                                </span>
                            )}
                            {tab.id === "won" && wonItems.length > 0 && (
                                <span className="ml-1.5 text-xs bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
                                    {wonItems.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                {renderTabContent()}
            </div>
        </div>
    );
};

export default MyRaffles;

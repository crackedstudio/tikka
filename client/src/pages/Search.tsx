import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import { parseSearchParams } from "../utils/searchParams";
import { mapListItemToCardProps } from "../services/raffleService";
import RaffleCard from "../components/cards/RaffleCard";
import RaffleCardSkeleton from "../components/ui/RaffleCardSkeleton";
import ErrorMessage from "../components/ui/ErrorMessage";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const SORT_OPTIONS = [
    { value: "", label: "Default" },
    { value: "end_time_asc", label: "Ending Soon" },
    { value: "end_time_desc", label: "Newest" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
];

const STATUS_OPTIONS = [
    { value: "", label: "All Statuses" },
    { value: "open", label: "Open" },
    { value: "ended", label: "Ended" },
    { value: "finalized", label: "Finalized" },
];

const SearchPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const filters = parseSearchParams(searchParams);
    const { results, isLoading, error } = useSearch(filters);
    const navigate = useNavigate();

    const updateFilter = (key: string, value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value) {
            next.set(key, value);
        } else {
            next.delete(key);
        }
        setSearchParams(next, { replace: true });
    };

    const clearFilters = () => {
        const q = searchParams.get("q");
        const next = new URLSearchParams();
        if (q) next.set("q", q);
        setSearchParams(next, { replace: true });
    };

    const hasActiveFilters = filters.status || filters.min_price || filters.max_price || filters.creator || filters.sort;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-6">
                <Breadcrumbs items={[
                    { label: 'Home', href: '/home' },
                    { label: 'Explore' }
                ]} />
            </div>

            <h1 className="text-2xl font-bold mb-6">
                {filters.q ? `Search results for "${filters.q}"` : "Search Raffles"}
            </h1>

            {/* Filter bar */}
            {filters.q && (
                <div className="mb-8 p-4 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Status</label>
                            <select
                                value={filters.status || ""}
                                onChange={(e) => updateFilter("status", e.target.value)}
                                className="w-full bg-gray-200 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#FE3796]"
                            >
                                {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Min Price</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={filters.min_price || ""}
                                onChange={(e) => updateFilter("min_price", e.target.value)}
                                placeholder="0"
                                className="w-full bg-gray-200 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#FE3796]"
                            />
                        </div>

                        <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Max Price</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={filters.max_price || ""}
                                onChange={(e) => updateFilter("max_price", e.target.value)}
                                placeholder="∞"
                                className="w-full bg-gray-200 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#FE3796]"
                            />
                        </div>

                        <div className="flex-1 min-w-[120px]">
                            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Creator</label>
                            <input
                                type="text"
                                value={filters.creator || ""}
                                onChange={(e) => updateFilter("creator", e.target.value)}
                                placeholder="Wallet address"
                                className="w-full bg-gray-200 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#FE3796]"
                            />
                        </div>

                        <div className="flex-1 min-w-[120px]">
                            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Sort</label>
                            <select
                                value={filters.sort || ""}
                                onChange={(e) => updateFilter("sort", e.target.value)}
                                className="w-full bg-gray-200 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#FE3796]"
                            >
                                {SORT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="px-4 py-2 text-sm text-gray-500 dark:text-white/50 hover:text-[#FE3796] transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((n) => (
                        <RaffleCardSkeleton key={n} />
                    ))}
                </div>
            )}

            {error && !isLoading && (
                <ErrorMessage
                    title="Search failed"
                    message={error.message}
                />
            )}

            {!isLoading && !error && results.length === 0 && filters.q && (
                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-6">
                        <div className="absolute inset-0 rounded-full bg-[#FE3796]/20 animate-ping"></div>
                        <div className="relative bg-white dark:bg-[#11172E] p-6 rounded-full border border-gray-200 dark:border-white/10">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FE3796" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                <line x1="8" y1="11" x2="14" y2="11" strokeOpacity="0.5"></line>
                            </svg>
                        </div>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No raffles found</h3>
                    <p className="text-gray-400 text-center max-w-xs mb-2">
                        We couldn't find anything matching <span className="text-pink-600 dark:text-[#FE3796]">"{filters.q}"</span>.
                    </p>
                    {hasActiveFilters && (
                        <p className="text-gray-400 text-center max-w-xs mb-4">
                            Try adjusting your filters or search term.
                        </p>
                    )}
                    <p className="text-gray-400 text-center max-w-xs mb-8">
                        Try a different keyword or category.
                    </p>

                    <button
                        onClick={() => navigate("/home")}
                        className="px-8 py-3 rounded-xl bg-[#FE3796] hover:brightness-110 transition-all font-medium text-sm shadow-lg shadow-[#FE3796]/20"
                    >
                        Go Back
                    </button>
                </div>
            )}

            {!isLoading && !error && results.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {results.map((raffle) => (
                        <RaffleCard
                            key={raffle.id}
                            {...mapListItemToCardProps(raffle)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchPage;

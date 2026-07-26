import React, { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearch, type SortOption } from "../hooks/useSearch";
import { toRaffleCardViewModel } from "../components/cards/raffleCardViewModel";
import RaffleCard from "../components/cards/RaffleCard";
import RaffleCardSkeleton from "../components/ui/RaffleCardSkeleton";
import ErrorMessage from "../components/ui/ErrorMessage";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const CATEGORIES = ["Gaming", "Electronics", "Art", "Music", "Sports", "Collectibles", "Other"];

const SearchPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get("q") || "";
    const categoriesParam = searchParams.get("category") || "";
    const selectedCategories = useMemo(
        () => categoriesParam
            ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
            : [],
        [categoriesParam]
    );
    const sortParam = (searchParams.get("sort") as SortOption) || "relevance";
    const { results, isLoading, error } = useSearch(query, selectedCategories, sortParam);

    const handleSortChange = useCallback((newSort: SortOption) => {
        const params = new URLSearchParams(searchParams);
        params.set("sort", newSort);
        setSearchParams(params, { replace: true });
    }, [searchParams, setSearchParams]);
    const navigate = useNavigate();

    const toggleCategory = useCallback((category: string) => {
        const current = new Set(selectedCategories);
        if (current.has(category)) {
            current.delete(category);
        } else {
            current.add(category);
        }
        const next = Array.from(current);
        const params = new URLSearchParams(searchParams);
        if (next.length > 0) {
            params.set("category", next.join(","));
        } else {
            params.delete("category");
        }
        setSearchParams(params, { replace: true });
    }, [selectedCategories, searchParams, setSearchParams]);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-6">
                <Breadcrumbs items={[
                    { label: 'Home', href: '/home' },
                    { label: 'Explore' }
                ]} />
            </div>

            <h1 className="text-2xl font-bold mb-6">
                {query ? `Search results for "${query}"` : "Search Raffles"}
            </h1>

            <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Sort by</span>
                {(
                    [
                        { value: "relevance", label: "Relevance" },
                        { value: "ending_soon", label: "Ending Soon" },
                        { value: "price_asc", label: "Price: Low–High" },
                        { value: "most_tickets", label: "Most Tickets" },
                    ] as { value: SortOption; label: string }[]
                ).map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => handleSortChange(value)}
                        className={`
                            px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
                            ${sortParam === value
                                ? "bg-[#FE3796] text-white shadow-lg shadow-[#FE3796]/20"
                                : "bg-white dark:bg-[#11172E] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:border-[#FE3796]/50"
                            }
                        `}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="mb-6 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 min-w-max pb-2">
                    {CATEGORIES.map((category) => {
                        const isActive = selectedCategories.includes(category);
                        return (
                            <button
                                key={category}
                                onClick={() => toggleCategory(category)}
                                className={`
                                    px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap
                                    ${isActive
                                        ? "bg-[#FE3796] text-white shadow-lg shadow-[#FE3796]/20"
                                        : "bg-white dark:bg-[#11172E] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:border-[#FE3796]/50"
                                    }
                                `}
                            >
                                {category}
                            </button>
                        );
                    })}
                </div>
            </div>

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

            {!isLoading && !error && results.length === 0 && query && (
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
                    <p className="text-gray-400 text-center max-w-xs mb-8">
                        We couldn't find anything matching <span className="text-pink-600 dark:text-[#FE3796]">"{query}"</span>.
                        Try a different keyword or category.
                    </p>

      {error && !isLoading && (
        <ErrorMessage title="Search failed" message={error.message} />
      )}

      {!isLoading && !error && results.length === 0 && query && (
        <div className="flex items-center justify-center py-20 animate-in fade-in duration-300">
          <p className="text-center text-lg text-gray-600 dark:text-gray-300">
            No raffles match "{query}". Try different keywords.
          </p>
        </div>
      )}

      {!isLoading && !error && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((raffle) => (
            <RaffleCard
              key={raffle.id}
              viewModel={toRaffleCardViewModel(raffle)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchPage;

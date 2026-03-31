import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import { mapListItemToCardProps } from "../services/raffleService";
import RaffleCard from "../components/cards/RaffleCard";
import RaffleCardSkeleton from "../components/ui/RaffleCardSkeleton";
import ErrorMessage from "../components/ui/ErrorMessage";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const SearchPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get("q") || "";
    const { results, isLoading, error } = useSearch(query);
    const navigate = useNavigate();

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
                    {/* Animated Icon */}
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

                    <button
                        onClick={() => navigate("/home")}
                        className="px-8 py-3 rounded-xl bg-[#FE3796] hover:brightness-110 transition-all font-medium text-sm shadow-lg shadow-[#FE3796]/20"
                    >
                        Go Back
                    </button>
                </div>
            )}

            {!isLoading && !error && (
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


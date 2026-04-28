import BrowseRaffles from "../components/home/BrowseRaffles";
import RaffleCardSkeleton from "../components/cards/RaffleCardSkeleton";
import FeaturedRaffleCardSkeleton from "../components/cards/FeaturedRaffleCardSkeleton";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import TrendingRaffles from "../components/landing/TrendingRaffles";
import VerifiedBadge from "../components/VerifiedBadge";
import RocketLaunch from "../assets/svg/RocketLaunch";
import { useState, useCallback } from "react";
import { useRaffles } from "../hooks/useRaffles";
import { fetchRaffles } from "../services/raffleService";
import type { ApiRaffleListItem } from "../types/types";

const PAGE_SIZE = 6;

const Home = () => {
    const { raffles, total, error, isLoading: rafflesLoading } = useRaffles({
        status: "open",
        limit: PAGE_SIZE,
    });

    const [extraRaffles, setExtraRaffles] = useState<ApiRaffleListItem[]>([]);
    const [loadingMore, setLoadingMore] = useState(false);

    const allRaffles = [...raffles, ...extraRaffles];
    const hasMore = allRaffles.length < total;

    const handleLoadMore = useCallback(async () => {
        setLoadingMore(true);
        try {
            const response = await fetchRaffles({
                status: "open",
                limit: PAGE_SIZE,
                offset: allRaffles.length,
            });
            setExtraRaffles((prev) => [...prev, ...response.raffles]);
        } catch {
            // Error is non-critical for load-more; initial load errors are already handled
        } finally {
            setLoadingMore(false);
        }
    }, [allRaffles.length]);

    return (
        <div className="bg-[#060C23] text-white flex flex-col space-y-16">
            <BrowseRaffles />
            <FeaturedRaffle isSignedIn={true} />
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
                {rafflesLoading ? (
                    <div className="text-center py-12">
                    <div className="w-full animation-pulse">
                        <FeaturedRaffleCardSkeleton />
                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                            <RaffleCardSkeleton />
                            <RaffleCardSkeleton />
                            <RaffleCardSkeleton />
                            <RaffleCardSkeleton />
                            <RaffleCardSkeleton />
                            <RaffleCardSkeleton />
                        </div>
                    </div>
                ) : error ? (
                    <div className="text-center py-12">
                        <div className="text-red-400 text-lg">
                            Error loading raffles: {error.message}
                        </div>
                    </div>
                ) : allRaffles.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-white text-lg">
                            No active raffles found
                        </div>
                        <div className="text-gray-400 text-sm mt-2">
                            Be the first to create a raffle!
                        </div>
                    </div>
                ) : (
                    <>
                        <TrendingRaffles raffleIds={allRaffles.map((r) => r.id)} />
                        {hasMore && (
                            <div className="w-full mt-5 flex justify-center">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                    className="bg-[#fe3796] hover:bg-[#fe3796]/90 disabled:opacity-50 disabled:cursor-not-allowed px-10 md:px-16 py-4 rounded-xl flex items-center justify-center space-x-4 mx-auto md:mx-0 transition-colors duration-200"
                                >
                                    <RocketLaunch />
                                    <span>
                                        {loadingMore ? "Loading..." : "Load More"}
                                    </span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex justify-between">
                <VerifiedBadge />
            </div>
        </div>
    );
};

export default Home;

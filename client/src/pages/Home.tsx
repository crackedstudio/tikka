import BrowseRaffles from "../components/home/BrowseRaffles";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import TrendingRaffles from "../components/landing/TrendingRaffles";
import VerifiedBadge from "../components/VerifiedBadge";
import RocketLaunch from "../assets/svg/RocketLaunch";
import { useState, useCallback } from "react";
import { useRaffles } from "../hooks/useRaffles";
import { fetchRaffles } from "../services/raffleService";
import type { ApiRaffleListItem } from "../types/types";
import RaffleCardSkeleton from "../components/ui/RaffleCardSkeleton";
import ErrorMessage from "../components/ui/ErrorMessage";
import { useTranslation } from "react-i18next";

const PAGE_SIZE = 6;

const Home = () => {
    const { raffles, total, error, isLoading: rafflesLoading, refetch } = useRaffles({
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
        <div className="bg-gray-50 dark:bg-[#060C23] text-gray-900 dark:text-white flex flex-col space-y-16">
            <BrowseRaffles />
            <FeaturedRaffle isSignedIn={true} />
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
                {rafflesLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                            <RaffleCardSkeleton key={i} />
                        ))}
                    </div>
                ) : error ? (
                    <ErrorMessage
                        title={t("home.failedToLoad")}
                        message={error.message}
                        onRetry={refetch}
                        disabled={rafflesLoading}
                    />
                ) : allRaffles.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-gray-900 dark:text-white text-lg">
                            {t("home.noActiveRaffles")}
                        </div>
                        <div className="text-gray-400 text-sm mt-2">
                            {t("home.beTheFirst")}
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
                                        {loadingMore ? t("home.loading") : t("home.loadMore")}
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



import BrowseRaffles from "../components/home/BrowseRaffles";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import TrendingRaffles from "../components/landing/TrendingRaffles";
import VerifiedBadge from "../components/VerifiedBadge";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useRaffles } from "../hooks/useRaffles";
import { fetchRaffles } from "../services/raffleService";
import { useIntersectionObserver } from "../hooks/useIntersectionObserver";
import type { ApiRaffleListItem } from "../types/types";
import RaffleCardSkeleton from "../components/ui/RaffleCardSkeleton";
import ErrorMessage from "../components/ui/ErrorMessage";
import { useTranslation } from "react-i18next";

const PAGE_SIZE = 6;
const SCROLL_CACHE_KEY = "home_scroll_state";

type ScrollCache = {
    offset: number;
    scrollY: number;
};

const Home = () => {
    const { t } = useTranslation();

    const cached = useMemo<ScrollCache | null>(() => {
        try {
            const raw = sessionStorage.getItem(SCROLL_CACHE_KEY);
            return raw ? (JSON.parse(raw) as ScrollCache) : null;
        } catch {
            return null;
        }
    }, []);

    const initialLimit = cached ? cached.offset + PAGE_SIZE : PAGE_SIZE;

    const { raffles, total, error, isLoading: rafflesLoading, refetch } = useRaffles({
        status: "open",
        limit: initialLimit,
    });

    const [extraRaffles, setExtraRaffles] = useState<ApiRaffleListItem[]>([]);
    const [loadingMore, setLoadingMore] = useState(false);

    const allRaffles = useMemo(() => {
        const map = new Map<number, ApiRaffleListItem>();
        [...raffles, ...extraRaffles].forEach((r) => map.set(r.id, r));
        return Array.from(map.values());
    }, [raffles, extraRaffles]);

    const hasMore = allRaffles.length < total;

    const handleLoadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const response = await fetchRaffles({
                status: "open",
                limit: PAGE_SIZE,
                offset: allRaffles.length,
            });
            setExtraRaffles((prev) => [...prev, ...response.raffles]);
        } catch {
            // silently ignore
        } finally {
            setLoadingMore(false);
        }
    }, [allRaffles.length, hasMore, loadingMore]);

    const sentinelRef = useIntersectionObserver(handleLoadMore, {
        rootMargin: "200px",
        enabled: hasMore && !loadingMore && !rafflesLoading,
    });

    useEffect(() => {
        return () => {
            const state: ScrollCache = {
                offset: allRaffles.length,
                scrollY: window.scrollY,
            };
            sessionStorage.setItem(SCROLL_CACHE_KEY, JSON.stringify(state));
        };
    }, [allRaffles.length]);

    useEffect(() => {
        if (!rafflesLoading && cached && cached.scrollY > 0) {
            const timer = setTimeout(() => {
                window.scrollTo({ top: cached.scrollY, behavior: "auto" });
                sessionStorage.removeItem(SCROLL_CACHE_KEY);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [rafflesLoading, cached]);

    return (
        <div className="bg-gray-50 dark:bg-[#060C23] text-gray-900 dark:text-white flex flex-col space-y-16">
            <BrowseRaffles />
            <FeaturedRaffle isSignedIn={true} />
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col min-h-[50vh]">
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
                    <div>
                        <TrendingRaffles raffleIds={allRaffles.map((r) => r.id)} />

                        {loadingMore && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                                    <RaffleCardSkeleton key={`more-${i}`} />
                                ))}
                            </div>
                        )}

                        {hasMore && <div ref={sentinelRef} className="h-4 mt-4" />}

                        {!hasMore && allRaffles.length > 0 && (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                {t("home.noMoreRaffles", "No more raffles")}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex justify-between pb-16">
                <VerifiedBadge />
            </div>
        </div>
    );
};

export default Home;


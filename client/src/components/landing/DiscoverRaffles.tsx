import { Eye } from "lucide-react";
import TrendingRaffles from "./TrendingRaffles";
import { useRaffles } from "../../hooks/useRaffles";
import RaffleCardSkeleton from "../ui/RaffleCardSkeleton";
import ErrorMessage from "../ui/ErrorMessage";
import { useTranslation } from "react-i18next";

const DiscoverRaffles = () => {
    const { t } = useTranslation();
    const { raffles, error, isLoading } = useRaffles({ status: "open" });

    return (
        <section className="w-full">
            <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16">
                {/* Header row */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-3xl md:text-4xl font-semibold mb-1">
                            {t("home.catchNextOpportunity")}
                        </h2>
                        <p className="text-gray-600 dark:text-white/70">
                            {t("home.exploreTrending")}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="inline-flex items-center gap-3 rounded-xl px-6 py-3 text-sm font-medium text-gray-900 dark:text-white transition hover:brightness-110 border border-[#FE3796]"
                    >
                        <Eye className="h-5 w-5" />
                        <span>{t("home.seeAll")}</span>
                    </button>
                </div>

                {/* Content */}
                <div className="mt-8">
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                            {[1, 2, 3].map((i) => (
                                <RaffleCardSkeleton key={i} />
                            ))}
                        </div>
                    ) : error ? (
                        <ErrorMessage
                            title={t("home.failedToLoad")}
                            message={(error as Error)?.message}
                        />
                    ) : raffles.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-gray-900 dark:text-white text-lg">
                                {t("home.noActiveRaffles")}
                            </div>
                            <div className="text-gray-400 text-sm mt-2">
                                {t("home.beTheFirst")}
                            </div>
                        </div>
                    ) : (
                        <TrendingRaffles raffleIds={raffles.map((r) => r.id)} />
                    )}
                </div>
            </div>
        </section>
    );
};

export default DiscoverRaffles;

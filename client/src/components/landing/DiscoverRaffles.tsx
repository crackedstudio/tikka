import { Eye } from "lucide-react";
import TrendingRaffles from "./TrendingRaffles";
import { useRaffles } from "../../hooks/useRaffles";
import RaffleCardSkeleton from "../ui/RaffleCardSkeleton";
import ErrorMessage from "../ui/ErrorMessage";

const DiscoverRaffles = () => {
    const { raffles, error, isLoading } = useRaffles({ status: "open" });

    return (
        <section className="w-full">
            <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16">
                {/* Header row */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-3xl md:text-4xl font-semibold mb-1">
                            Catch Your Next Opportunity
                        </h2>
                        <p className="text-white/70">
                            Explore New Trending Raffles
                        </p>
                    </div>

                    <button
                        type="button"
                        className="inline-flex items-center gap-3 rounded-xl px-6 py-3 text-sm font-medium text-white transition hover:brightness-110 border border-[#FE3796]"
                    >
                        <Eye className="h-5 w-5" />
                        <span>See All</span>
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
                            title="Error loading raffles"
                            message={(error as Error)?.message}
                        />
                    ) : raffles.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-white text-lg">
                                No active raffles found
                            </div>
                            <div className="text-gray-400 text-sm mt-2">
                                Be the first to create a raffle!
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

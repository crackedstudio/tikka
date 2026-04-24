import { Eye } from "lucide-react";

import RecentlyAddedCard from "../cards/RecentlyAddedCard";
import VerifiedBadge from "../VerifiedBadge";
import { useRaffles, useRaffle } from "../../hooks/useRaffles";

const RecentlyAddedCardWrapper: React.FC<{ raffleId: number }> = ({
    raffleId,
}) => {
    const { raffle, isLoading, error } = useRaffle(raffleId);

    if (isLoading) {
        return (
            <div className="w-full bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4 animate-pulse">
                <div className="w-full h-48 bg-gray-700 rounded-3xl"></div>
                <div className="h-4 bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-700 rounded"></div>
                <div className="h-8 bg-gray-700 rounded"></div>
            </div>
        );
    }

    if (error || !raffle) {
        return (
            <div className="w-full bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4">
                <div className="text-red-400 text-center text-sm">
                    Error loading raffle
                </div>
            </div>
        );
    }

    return (
        <RecentlyAddedCard
            image={raffle.image}
            title={raffle.metadata.title}
            countdown={raffle.countdown}
            ticketPrice={raffle.ticketPriceFormatted}
            entries={raffle.entries}
            progress={raffle.progress}
        />
    );
};

const RecentlyAdded = () => {
    const { raffles, isLoading, error } = useRaffles({ limit: 4 });

    return (
        <section className="w-full">
            <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-12">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                    <h1 className="font-semibold text-3xl md:text-4xl">
                        Recently Added
                    </h1>

                    <button className="inline-flex items-center gap-3 rounded-xl px-6 py-3 text-sm font-medium text-white transition hover:brightness-110 border border-[#FE3796]">
                        <Eye className="h-5 w-5" />
                        <span>See All</span>
                    </button>
                </div>

                {/* Grid */}
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                    {isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className="w-full bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4 animate-pulse"
                            >
                                <div className="w-full h-48 bg-gray-700 rounded-3xl"></div>
                                <div className="h-4 bg-gray-700 rounded"></div>
                                <div className="h-4 bg-gray-700 rounded"></div>
                                <div className="h-8 bg-gray-700 rounded"></div>
                            </div>
                        ))
                    ) : error ? (
                        <div className="col-span-full text-center py-12">
                            <div className="text-red-400 text-lg">
                                Error loading raffles: {error.message}
                            </div>
                        </div>
                    ) : raffles.length === 0 ? (
                        <div className="col-span-full text-center py-12">
                            <div className="text-white text-lg">
                                No raffles found yet
                            </div>
                        </div>
                    ) : (
                        raffles.map((raffle) => (
                            <RecentlyAddedCardWrapper
                                key={raffle.id}
                                raffleId={raffle.id}
                            />
                        ))
                    )}
                </div>

                <VerifiedBadge />
            </div>
        </section>
    );
};

export default RecentlyAdded;

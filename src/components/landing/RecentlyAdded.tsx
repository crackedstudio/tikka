import { Eye } from "lucide-react";
import ps5 from "../../assets/ps5.png";

import RecentlyAddedCard from "../cards/RecentlyAddedCard";
import VerifiedBadge from "../VerifiedBadge";

const RecentlyAdded = () => {
    const recentlyAddedList = [
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
    ];

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
                    {recentlyAddedList.map((raffle, index) => (
                        <RecentlyAddedCard
                            key={index}
                            image={raffle.image}
                            title={raffle.title}
                            countdown={raffle.countdown}
                            ticketPrice={raffle.ticketPrice}
                            entries={raffle.entries}
                            progress={raffle.progress}
                        />
                    ))}
                </div>

                <VerifiedBadge />
            </div>
        </section>
    );
};

export default RecentlyAdded;

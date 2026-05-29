import React from "react";
import Line from "../../assets/svg/Line";

const FeaturedRaffleCardSkeleton: React.FC = () => {
    return (
        <div 
            className="w-full bg-[#11172E] p-4 md:p-6 lg:p-8 rounded-3xl border border-[#1F263F] my-5 animate-pulse"
            aria-busy="true"
            aria-label="Loading featured raffle"
        >
            <div className="flex flex-col gap-6 md:flex-row md:gap-8 items-stretch">
                {/* Image Placeholder */}
                <div className="w-full md:w-1/2 h-64 md:h-auto bg-[#242B46] rounded-2xl" />

                {/* Content */}
                <div className="w-full md:w-1/2 flex flex-col space-y-6">
                    {/* Title & Body Placeholder */}
                    <div className="space-y-3">
                        <div className="h-8 bg-[#242B46] rounded w-3/4" />
                        <div className="h-4 bg-[#242B46] rounded w-full" />
                        <div className="h-4 bg-[#242B46] rounded w-5/6" />
                    </div>

                    <Line />

                    {/* Prize + Countdown Placeholder */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                            <div className="h-4 bg-[#242B46] rounded w-20" />
                            <div className="h-6 bg-[#242B46] rounded w-32" />
                        </div>

                        <div className="sm:text-right space-y-2">
                            <div className="h-4 bg-[#242B46] rounded w-16 ml-auto" />
                            <div className="flex justify-start sm:justify-end gap-1">
                                <div className="h-6 w-8 bg-[#242B46] rounded" />
                                <div className="h-6 w-8 bg-[#242B46] rounded" />
                                <div className="h-6 w-8 bg-[#242B46] rounded" />
                                <div className="h-6 w-8 bg-[#242B46] rounded" />
                            </div>
                        </div>
                    </div>

                    <Line />

                    {/* Ticket & Entries Placeholder */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-2">
                            <div className="h-3 bg-[#242B46] rounded w-16" />
                            <div className="h-4 bg-[#242B46] rounded w-12" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-3 bg-[#242B46] rounded w-12" />
                            <div className="h-4 bg-[#242B46] rounded w-8" />
                        </div>
                    </div>

                    {/* Progress Placeholder */}
                    <div className="w-full h-2 bg-[#242B46] rounded-full" />

                    {/* CTA Placeholder */}
                    <div className="w-full h-14 bg-[#242B46] rounded-xl self-stretch md:self-start md:w-3/4 lg:w-1/2" />
                </div>
            </div>
        </div>
    );
};

export default FeaturedRaffleCardSkeleton;

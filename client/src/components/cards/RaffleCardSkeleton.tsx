import React from "react";
import Line from "../../assets/svg/Line";

const RaffleCardSkeleton: React.FC = () => {
    return (
        <div 
            className="w-full bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4 animate-pulse"
            aria-busy="true"
            aria-label="Loading raffle"
        >
            {/* Image Placeholder */}
            <div className="w-full h-48 bg-[#242B46] rounded-3xl" />

            {/* Title & Prize Placeholder */}
            <div className="space-y-2">
                <div className="h-6 bg-[#242B46] rounded w-3/4" />
                <div className="h-4 bg-[#242B46] rounded w-1/2" />
            </div>

            {/* Countdown Placeholder */}
            <div>
                <Line />
                <div className="flex justify-center space-x-1 my-2">
                    <div className="h-6 w-8 bg-[#242B46] rounded" />
                    <div className="h-6 w-8 bg-[#242B46] rounded" />
                    <div className="h-6 w-8 bg-[#242B46] rounded" />
                    <div className="h-6 w-8 bg-[#242B46] rounded" />
                </div>
                <Line />
            </div>

            {/* Ticket & Entries Placeholder */}
            <div className="flex justify-between">
                <div className="space-y-1">
                    <div className="h-3 bg-[#242B46] rounded w-16" />
                    <div className="h-4 bg-[#242B46] rounded w-12" />
                </div>
                <div className="space-y-1">
                    <div className="h-3 bg-[#242B46] rounded w-12" />
                    <div className="h-4 bg-[#242B46] rounded w-8" />
                </div>
            </div>

            {/* Progress Placeholder */}
            <div className="w-full h-2 bg-[#242B46] rounded-full mt-2" />

            {/* Button Placeholder */}
            <div className="w-full h-14 bg-[#242B46] rounded-xl mt-4" />
        </div>
    );
};

export default RaffleCardSkeleton;

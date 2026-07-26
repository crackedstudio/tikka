import React from "react";
import Line from "../../assets/svg/Line";

const RaffleCardSkeleton: React.FC = () => {
    return (
        <div 
            className="w-full bg-white dark:bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4 animate-pulse"
            aria-busy="true"
            aria-label="Loading raffle"
        >
            {/* Clickable content area structural placeholder */}
            <div className="flex flex-col space-y-4">
                {/* Image Placeholder */}
                <div className="w-full">
                    <div className="w-full aspect-video bg-gray-200 dark:bg-[#242B46] rounded-3xl" />
                </div>

                {/* Title & Prize Placeholder */}
                <div className="space-y-2 mt-1">
                    <div className="h-7 bg-gray-200 dark:bg-[#242B46] rounded w-3/4" />
                    <div className="h-5 bg-gray-200 dark:bg-[#242B46] rounded w-1/2" />
                </div>

                {/* Countdown Placeholder */}
                <div>
                    <Line />
                    <div className="flex justify-center mb-1">
                        <div className="h-4 w-12 bg-gray-200 dark:bg-[#242B46] rounded" />
                    </div>
                    <div className="flex justify-center space-x-1">
                        <div className="h-[28px] w-8 bg-gray-200 dark:bg-[#242B46] rounded" />
                        <div className="h-[28px] w-8 bg-gray-200 dark:bg-[#242B46] rounded" />
                        <div className="h-[28px] w-8 bg-gray-200 dark:bg-[#242B46] rounded" />
                        <div className="h-[28px] w-8 bg-gray-200 dark:bg-[#242B46] rounded" />
                    </div>
                    <Line />
                </div>
            </div>

            {/* Bottom info section Placeholder */}
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center text-sm">
                    <div className="space-y-1">
                        <div className="h-4 bg-gray-200 dark:bg-[#242B46] rounded w-20" />
                        <div className="h-5 bg-gray-200 dark:bg-[#242B46] rounded w-24" />
                    </div>
                    <div className="space-y-1 flex flex-col items-end">
                        <div className="h-4 bg-gray-200 dark:bg-[#242B46] rounded w-14" />
                        <div className="h-5 bg-gray-200 dark:bg-[#242B46] rounded w-10" />
                    </div>
                </div>

                <div className="w-full">
                    <div className="h-2 w-full bg-gray-200 dark:bg-[#242B46] rounded-full" />
                </div>

                {/* Button Placeholder */}
                <div className="w-full h-[56px] bg-gray-200 dark:bg-[#242B46] rounded-xl" />
            </div>
        </div>
    );
};

export default RaffleCardSkeleton;

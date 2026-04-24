import React from "react";

interface RaffleCardSkeletonProps {
    bgColor?: string;
    rounded?: string;
}

const RaffleCardSkeleton: React.FC<RaffleCardSkeletonProps> = ({
    bgColor = "bg-[#11172E]",
    rounded = "rounded-3xl",
}) => {
    return (
        <div
            className={`w-full ${bgColor} p-4 ${rounded} flex flex-col space-y-4 animate-pulse`}
        >
            {/* Image */}
            <div className="w-full h-48 bg-gray-700 rounded-3xl" />
            {/* Title */}
            <div>
                <div className="h-6 bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-700 rounded w-1/2" />
            </div>
            {/* Countdown */}
            <div className="flex justify-center space-x-1">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className="h-8 w-10 bg-gray-700 rounded"
                    />
                ))}
            </div>
            {/* Ticket & Entries */}
            <div className="flex justify-between">
                <div>
                    <div className="h-3 bg-gray-700 rounded w-16 mb-1" />
                    <div className="h-4 bg-gray-700 rounded w-12" />
                </div>
                <div>
                    <div className="h-3 bg-gray-700 rounded w-12 mb-1" />
                    <div className="h-4 bg-gray-700 rounded w-8" />
                </div>
            </div>
            {/* Progress bar */}
            <div className="h-[5px] bg-gray-700 rounded-full" />
            {/* Button */}
            <div className="h-12 bg-gray-700 rounded-xl" />
        </div>
    );
};

export default RaffleCardSkeleton;

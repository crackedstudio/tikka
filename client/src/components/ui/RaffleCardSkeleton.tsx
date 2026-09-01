const RaffleCardSkeleton = () => {
    return (
        <div className="w-full bg-white dark:bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4 animate-pulse">
            <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-3xl" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
    );
};

export default RaffleCardSkeleton;

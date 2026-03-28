import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRaffle, useRaffles } from "../hooks/useRaffles";
import RaffleCardSkeleton from "../components/ui/RaffleCardSkeleton";
import ErrorMessage from "../components/ui/ErrorMessage";

const MyRaffles: React.FC = () => {
    const [activeTab, setActiveTab] = useState("created");

    const tabs = [
        { id: "created", label: "Created" },
        { id: "participated", label: "Participated" },
        { id: "won", label: "Won" },
    ];

    const {
        raffles: createdRaffles,
        isLoading: createdLoading,
        error: createdError,
    } = useRaffles({ status: "open", limit: 3 });

    const {
        raffles: participatedRaffles,
        isLoading: participatedLoading,
        error: participatedError,
    } = useRaffles({ status: "open", limit: 3 });

    const {
        raffles: wonRaffles,
        isLoading: wonLoading,
        error: wonError,
    } = useRaffles({ status: "closed", limit: 3 });

    const displayRaffles = useMemo(() => {
        const grouped = {
            created: createdRaffles,
            participated: participatedRaffles,
            won: wonRaffles,
        };

        return (grouped as Record<string, typeof createdRaffles>)[activeTab]?.map(
            (raffle, index) => ({
                id: raffle.id,
                ticketCount: activeTab === "won" ? 1 : index + 1,
            })
        ) || [];
    }, [activeTab, createdRaffles, participatedRaffles, wonRaffles]);

    const isLoading = createdLoading || participatedLoading || wonLoading;
    const error = createdError || participatedError || wonError;

    return (
        <div className="min-h-screen text-gray-900 dark:text-white">
            <div className="w-full max-w-7xl mx-auto px-6 py-8">
                {/* Page Title */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        My Raffles
                    </h1>
                    <p className="text-gray-700 dark:text-gray-300">
                        Manage your created and participated raffles
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex justify-center space-x-1 mb-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 ${
                                activeTab === tab.id
                                    ? "bg-gray-200 dark:bg-[#2A264A] text-gray-900 dark:text-white"
                                    : "text-gray-400 hover:text-gray-900 dark:text-white"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Raffles Grid */}
                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="text-gray-900 dark:text-white text-lg">Loading your raffles...</div>
                    </div>
                ) : error ? (
                    <div className="text-center py-12">
                        <div className="text-red-400 text-lg">Error loading raffles: {error.message}</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {displayRaffles.map((raffle) => (
                            <RaffleCardWrapper
                                key={raffle.id}
                                raffleId={raffle.id}
                                ticketCount={raffle.ticketCount}
                            />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && displayRaffles.length === 0 && (
                    <div className="text-center py-12">
                        <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg
                                className="w-12 h-12 text-gray-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </div>
                        <h3 className="text-gray-900 dark:text-white text-xl font-semibold mb-2">
                            No raffles found
                        </h3>
                        <p className="text-gray-400 mb-6">
                            {activeTab === "created"
                                ? "No created raffles found."
                                : activeTab === "participated"
                                ? "No participated raffles found."
                                : "No won raffles found."}
                        </p>
                        <Link
                            to="/create"
                            className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 dark:text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200"
                        >
                            Create Your First Raffle
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
};

// Wrapper component to fetch individual raffle data for MyRaffles
const RaffleCardWrapper: React.FC<{
    raffleId: number;
    ticketCount: number;
}> = ({ raffleId, ticketCount }) => {
    const navigate = useNavigate();
    const { raffle, error, isLoading } = useRaffle(raffleId);

    if (isLoading) {
        return <RaffleCardSkeleton bgColor="bg-white dark:bg-[#1E1932]" rounded="rounded-xl" />;
    }

    if (error || !raffle) {
        return (
            <div className="bg-white dark:bg-[#1E1932] rounded-xl p-6">
                <ErrorMessage
                    variant="inline"
                    title="Error loading raffle"
                    message={error?.message}
                />
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-[#1E1932] rounded-xl p-6">
            <img
                src={raffle.image}
                alt={raffle.description}
                className="w-full h-48 object-cover rounded-lg mb-4"
            />
            <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-2">
                {raffle.description}
            </h3>
            <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Your Tickets:</span>
                    <span className="text-gray-900 dark:text-white">{ticketCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Tickets:</span>
                    <span className="text-gray-900 dark:text-white">{raffle.entries}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Status:</span>
                    <span
                        className={`${
                            raffle.isActive ? "text-green-400" : "text-red-400"
                        }`}
                    >
                        {raffle.isActive ? "Active" : "Ended"}
                    </span>
                </div>
            </div>
            <div className="flex space-x-2">
                <button 
                    onClick={() => navigate(`/raffles/${raffleId}`)}
                    className="flex-1 bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 dark:text-white py-2 px-4 rounded-lg transition-colors duration-200"
                >
                    View Details
                </button>
                {raffle.isActive && (
                    <button 
                        onClick={() => navigate(`/raffles/${raffleId}`)}
                        className="bg-gray-200 dark:bg-[#2A264A] hover:bg-gray-300 dark:bg-[#3A365A] text-gray-900 dark:text-white py-2 px-4 rounded-lg transition-colors duration-200"
                    >
                        Buy More
                    </button>
                )}
            </div>
        </div>
    );
};


export default MyRaffles;

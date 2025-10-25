import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useUserRaffleParticipation } from "../hooks/useRaffleContract";
import { useRaffle } from "../hooks/useRaffles";

const MyRaffles: React.FC = () => {
    const [activeTab, setActiveTab] = useState("created");
    const { address } = useAccount();
    const {
        data: userParticipation,
        error: participationError,
        isLoading: participationLoading,
    } = useUserRaffleParticipation(address || "");

    console.log("🔍 MyRaffles - Address:", address);
    console.log("🔍 MyRaffles - User participation:", userParticipation);
    console.log("🔍 MyRaffles - Participation error:", participationError);
    console.log("🔍 MyRaffles - Participation loading:", participationLoading);

    const tabs = [
        { id: "created", label: "Created" },
        { id: "participated", label: "Participated" },
        { id: "won", label: "Won" },
    ];

    // Get user's raffle participation data from contract
    const myRaffles =
        userParticipation &&
        Array.isArray(userParticipation) &&
        userParticipation.length >= 2
            ? (userParticipation[0] as bigint[]).map(
                  (raffleId: bigint, index: number) => ({
                      id: Number(raffleId),
                      ticketCount: Number(
                          (userParticipation[1] as bigint[])[index]
                      ),
                  })
              )
            : [];

    return (
        <div className="min-h-screen text-white">
            <div className="w-full max-w-7xl mx-auto px-6 py-8">
                {/* Page Title */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        My Raffles
                    </h1>
                    <p className="text-gray-300">
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
                                    ? "bg-[#2A264A] text-white"
                                    : "text-gray-400 hover:text-white"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Loading State */}
                {participationLoading && (
                    <div className="text-center py-12">
                        <div className="text-white text-lg">
                            Loading your raffles from blockchain...
                        </div>
                    </div>
                )}

                {/* Error State */}
                {participationError && (
                    <div className="text-center py-12">
                        <div className="text-red-400 text-lg">
                            Error loading raffles: {participationError.message}
                        </div>
                    </div>
                )}

                {/* Raffles Grid */}
                {!participationLoading && !participationError && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {myRaffles.map((raffle) => (
                            <RaffleCardWrapper
                                key={raffle.id}
                                raffleId={raffle.id}
                                ticketCount={raffle.ticketCount}
                            />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {myRaffles.length === 0 && (
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
                        <h3 className="text-white text-xl font-semibold mb-2">
                            No raffles found
                        </h3>
                        <p className="text-gray-400 mb-6">
                            {activeTab === "created"
                                ? "You haven't created any raffles yet."
                                : "You haven't participated in any raffles yet."}
                        </p>
                        <Link
                            to="/create"
                            className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200"
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
    const { raffle, error, isLoading } = useRaffle(raffleId);

    if (isLoading) {
        return (
            <div className="bg-[#1E1932] rounded-xl p-6 animate-pulse">
                <div className="w-full h-48 bg-gray-700 rounded-lg mb-4"></div>
                <div className="h-6 bg-gray-700 rounded mb-2"></div>
                <div className="space-y-2 mb-4">
                    <div className="h-4 bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-700 rounded"></div>
                </div>
                <div className="h-10 bg-gray-700 rounded"></div>
            </div>
        );
    }

    if (error || !raffle) {
        return (
            <div className="bg-[#1E1932] rounded-xl p-6">
                <div className="text-red-400 text-center">
                    Error loading raffle
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#1E1932] rounded-xl p-6">
            <img
                src={raffle.image}
                alt={raffle.description}
                className="w-full h-48 object-cover rounded-lg mb-4"
            />
            <h3 className="text-white font-semibold text-lg mb-2">
                {raffle.description}
            </h3>
            <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Your Tickets:</span>
                    <span className="text-white">{ticketCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Tickets:</span>
                    <span className="text-white">{raffle.entries}</span>
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
                <button className="flex-1 bg-[#FF389C] hover:bg-[#FF389C]/90 text-white py-2 px-4 rounded-lg transition-colors duration-200">
                    View Details
                </button>
                {raffle.isActive && (
                    <button className="bg-[#2A264A] hover:bg-[#3A365A] text-white py-2 px-4 rounded-lg transition-colors duration-200">
                        Buy More
                    </button>
                )}
            </div>
        </div>
    );
};

export default MyRaffles;

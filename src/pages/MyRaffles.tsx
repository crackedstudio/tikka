import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import {
    useUserRaffleParticipation,
    useAllRaffleIds,
} from "../hooks/useRaffleContract";
import { useRaffle } from "../hooks/useRaffles";

const MyRaffles: React.FC = () => {
    const [activeTab, setActiveTab] = useState("created");
    const { address } = useAccount();
    const {
        data: userParticipation,
        error: participationError,
        isLoading: participationLoading,
    } = useUserRaffleParticipation(address || "");

    // Fallback: Get all raffles if user participation fails
    const {
        data: allRaffleIds,
        error: allRafflesError,
        isLoading: allRafflesLoading,
    } = useAllRaffleIds();

    console.log("🔍 MyRaffles - Address:", address);
    console.log("🔍 MyRaffles - User participation:", userParticipation);
    console.log("🔍 MyRaffles - Participation error:", participationError);
    console.log("🔍 MyRaffles - Participation loading:", participationLoading);

    // Show connect wallet message if no address
    if (!address) {
        return (
            <div className="min-h-screen text-white">
                <div className="w-full max-w-7xl mx-auto px-6 py-8">
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
                            Connect Your Wallet
                        </h3>
                        <p className="text-gray-400 mb-6">
                            Please connect your wallet to view your raffles.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const tabs = [
        { id: "created", label: "Created" },
        { id: "participated", label: "Participated" },
        { id: "won", label: "Won" },
    ];

    // Get user's raffle participation data from contract
    const myRaffles = useMemo(() => {
        console.log(
            "🔍 MyRaffles - Processing userParticipation:",
            userParticipation
        );

        if (!userParticipation) {
            console.log("🔍 MyRaffles - No userParticipation data");
            return [];
        }

        // The contract returns [raffleIds[], ticketCounts[]]
        if (Array.isArray(userParticipation) && userParticipation.length >= 2) {
            const raffleIds = userParticipation[0] as bigint[];
            const ticketCounts = userParticipation[1] as bigint[];

            console.log("🔍 MyRaffles - Raffle IDs:", raffleIds);
            console.log("🔍 MyRaffles - Ticket counts:", ticketCounts);

            if (Array.isArray(raffleIds) && Array.isArray(ticketCounts)) {
                const processedRaffles = raffleIds.map(
                    (raffleId: bigint, index: number) => ({
                        id: Number(raffleId),
                        ticketCount: Number(ticketCounts[index] || 0),
                    })
                );

                console.log(
                    "🔍 MyRaffles - Processed raffles:",
                    processedRaffles
                );
                return processedRaffles;
            }
        }

        console.log(
            "🔍 MyRaffles - Invalid data structure, returning empty array"
        );
        return [];
    }, [userParticipation]);

    // Fallback: If user has no participation but there are raffles, show them as "available to participate"
    const fallbackRaffles = useMemo(() => {
        if (
            myRaffles.length === 0 &&
            allRaffleIds &&
            Array.isArray(allRaffleIds) &&
            allRaffleIds.length > 0
        ) {
            console.log(
                "🔍 MyRaffles - Using fallback: showing all raffles as available"
            );
            return allRaffleIds.slice(0, 6).map((raffleId: bigint) => ({
                id: Number(raffleId),
                ticketCount: 0, // User hasn't participated yet
            }));
        }
        return [];
    }, [myRaffles.length, allRaffleIds]);

    // Use fallback if no user participation
    const displayRaffles = myRaffles.length > 0 ? myRaffles : fallbackRaffles;

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

                {/* Debug Info */}
                <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                    <h4 className="text-white font-semibold mb-2">
                        Debug Info:
                    </h4>
                    <div className="text-sm text-gray-300 space-y-1">
                        <div>Address: {address}</div>
                        <div>
                            User Participation Loading:{" "}
                            {participationLoading ? "Yes" : "No"}
                        </div>
                        <div>
                            User Participation Error:{" "}
                            {participationError?.message || "None"}
                        </div>
                        <div>
                            User Participation Raw Data:{" "}
                            {JSON.stringify(userParticipation)}
                        </div>
                        <div>
                            All Raffles Loading:{" "}
                            {allRafflesLoading ? "Yes" : "No"}
                        </div>
                        <div>
                            All Raffles Error:{" "}
                            {allRafflesError?.message || "None"}
                        </div>
                        <div>
                            All Raffles Data: {JSON.stringify(allRaffleIds)}
                        </div>
                        <div>Processed Raffles: {myRaffles.length}</div>
                        <div>Fallback Raffles: {fallbackRaffles.length}</div>
                        <div>Display Raffles: {displayRaffles.length}</div>
                        <div>
                            Contract Address:
                            0x60fd4f42B818b173d7252859963c7131Ed68CA6D
                        </div>
                    </div>
                </div>

                {/* Test Contract Connection */}
                <div className="mb-6 p-4 bg-blue-900 rounded-lg">
                    <h4 className="text-white font-semibold mb-2">
                        Contract Test:
                    </h4>
                    <div className="text-sm text-gray-300 space-y-1">
                        <div>Testing contract connection...</div>
                        <div>
                            If you see this, the contract calls are being made.
                        </div>
                        <div>Check the browser console for detailed logs.</div>
                    </div>
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
                {displayRaffles.length === 0 && (
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

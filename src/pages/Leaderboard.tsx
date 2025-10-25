import React, { useState } from "react";
import type {
    TopPlayer,
    Player,
    PlayerStats as PlayerStatsType,
    Achievement,
} from "../types/types";
import LeaderboardSection from "../components/leaderboard/LeaderboardSection";
import PlayerStats from "../components/leaderboard/PlayerStats";

const Leaderboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState("weekly");
    // const { data: platformStats, error, isLoading } = usePlatformStatistics();

    // Leaderboard data will come from contract statistics
    // For now, showing placeholder since leaderboard functionality needs to be implemented
    const topPlayers: TopPlayer[] = [];

    const players: Player[] = [];

    const playerStats: PlayerStatsType = {
        name: "CryptoRaffle",
        joinedDate: "Joined recently",
        tickets: 0,
        wins: 0,
        level: 1,
        currentXp: 0,
        nextLevelXp: 100,
        dailyStreak: 0,
        streakDays: [false, false, false, false, false, false, false],
    };

    const achievements: Achievement[] = [];

    return (
        <div className="min-h-screen text-white">
            {/* Header */}
            <div className="w-full max-w-7xl mx-auto px-6 py-8">
                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Side - Leaderboard */}
                    <div className="lg:col-span-2">
                        {topPlayers.length === 0 && players.length === 0 ? (
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
                                    Leaderboard Coming Soon
                                </h3>
                                <p className="text-gray-400 mb-6">
                                    Track your raffle performance and compete
                                    with other players.
                                </p>
                                <p className="text-sm text-gray-500">
                                    This feature will be available once users
                                    start participating in raffles.
                                </p>
                            </div>
                        ) : (
                            <LeaderboardSection
                                activeTab={activeTab}
                                onTabChange={setActiveTab}
                                topPlayers={topPlayers}
                                players={players}
                            />
                        )}
                    </div>

                    {/* Right Side - Player Stats */}
                    <div className="lg:col-span-1">
                        <PlayerStats
                            stats={playerStats}
                            achievements={achievements}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;

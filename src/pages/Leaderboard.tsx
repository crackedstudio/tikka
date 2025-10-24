import React, { useState } from "react";
import { Link } from "react-router-dom";
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

    // Mock data - in a real app, this would come from an API
    const topPlayers: TopPlayer[] = [
        {
            id: "1",
            name: "RaffleKing",
            rank: 1,
            xp: 2345,
            color: "gold",
        },
        {
            id: "2",
            name: "CryptoKing",
            rank: 2,
            xp: 1250,
            color: "purple",
        },
        {
            id: "3",
            name: "BlockQueen",
            rank: 3,
            xp: 980,
            color: "orange",
        },
    ];

    const players: Player[] = [
        {
            id: "you",
            name: "You",
            rank: 1,
            wins: 87,
            xpWon: 450,
            badges: [
                {
                    id: "rising-star",
                    name: "Rising Star",
                    icon: "lightning",
                    color: "yellow",
                },
            ],
        },
        {
            id: "web3wizard",
            name: "Web3Wizard",
            rank: 2,
            wins: 87,
            xpWon: 450,
            badges: [
                {
                    id: "hot-streak",
                    name: "Hot Streak",
                    icon: "flame",
                    color: "red",
                },
            ],
        },
        {
            id: "cryptonova",
            name: "CryptoNova",
            rank: 3,
            wins: 87,
            xpWon: 450,
        },
        {
            id: "blockchainbabe",
            name: "BlockchainBabe",
            rank: 4,
            wins: 87,
            xpWon: 450,
        },
        {
            id: "etherexplorer",
            name: "EtherExplorer",
            rank: 5,
            wins: 87,
            xpWon: 450,
            badges: [
                {
                    id: "veteran",
                    name: "Veteran",
                    icon: "skull",
                    color: "gray",
                },
            ],
        },
    ];

    const playerStats: PlayerStatsType = {
        name: "CryptoRaffle",
        joinedDate: "Joined 3 months ago",
        tickets: 87,
        wins: 3,
        level: 8,
        currentXp: 450,
        nextLevelXp: 500,
        dailyStreak: 4,
        streakDays: [true, true, true, true, false, false, false],
    };

    const achievements: Achievement[] = [
        {
            id: "first-ticket",
            name: "First Ticket",
            icon: "ticket",
            color: "teal",
        },
        {
            id: "first-win",
            name: "First Win",
            icon: "trophy",
            color: "purple",
        },
        {
            id: "referral",
            name: "Referral",
            icon: "share",
            color: "yellow",
        },
    ];

    return (
        <div className="min-h-screen bg-[#1A162C] text-white">
            {/* Header */}
            <div className="w-full max-w-7xl mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-8">
                    <Link to="/" className="flex items-center space-x-3">
                        <img
                            src="/src/assets/svg/logo.svg"
                            alt="logo"
                            className="h-7 w-auto"
                        />
                        <img
                            src="/src/assets/svg/Tikka.svg"
                            alt="tikka"
                            className="h-5 w-auto mt-1"
                        />
                    </Link>

                    <div className="hidden lg:flex items-center space-x-6">
                        <Link
                            to="/home"
                            className="text-white/80 hover:text-white transition"
                        >
                            Discover Raffles
                        </Link>
                        <Link
                            to="/create"
                            className="text-white/80 hover:text-white transition"
                        >
                            Create Raffle
                        </Link>
                        <a
                            href="#"
                            className="text-white/80 hover:text-white transition"
                        >
                            My Raffles
                        </a>
                        <a
                            href="#"
                            className="text-white/80 hover:text-white transition"
                        >
                            Leaderboard
                        </a>
                    </div>

                    <button className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200">
                        Sh4uak...ghT9
                    </button>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Side - Leaderboard */}
                    <div className="lg:col-span-2">
                        <LeaderboardSection
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            topPlayers={topPlayers}
                            players={players}
                        />
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

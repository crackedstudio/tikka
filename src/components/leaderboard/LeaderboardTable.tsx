import React from "react";
import type { Player } from "../../types/types";

interface LeaderboardTableProps {
    players: Player[];
}

const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ players }) => {
    const getBadgeIcon = (badgeName: string) => {
        switch (badgeName) {
            case "Rising Star":
                return (
                    <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                );
            case "Hot Streak":
                return (
                    <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                    </svg>
                );
            case "Veteran":
                return (
                    <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M10 2L3 7v11h14V7l-7-5z" />
                    </svg>
                );
            default:
                return null;
        }
    };

    const getRowBackground = (player: Player) => {
        if (player.name === "You") {
            return "bg-yellow-500/20 border-l-4 border-yellow-500";
        }
        if (player.rank === 2) {
            return "bg-purple-500/20";
        }
        return "bg-transparent";
    };

    return (
        <div className="bg-[#1E1932] rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-[#2A264A] text-gray-300 text-sm font-medium">
                <div>Rank</div>
                <div>Player</div>
                <div>Wins</div>
                <div>ETH won</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-gray-700">
                {players.map((player) => (
                    <div
                        key={player.id}
                        className={`grid grid-cols-4 gap-4 px-6 py-4 ${getRowBackground(
                            player
                        )}`}
                    >
                        {/* Rank */}
                        <div className="flex items-center">
                            <span className="text-white font-semibold">
                                {player.rank}
                            </span>
                        </div>

                        {/* Player */}
                        <div className="flex items-center space-x-3">
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                <div className="w-6 h-6 rounded-full bg-gray-300"></div>
                            </div>

                            {/* Name and Badges */}
                            <div className="flex flex-col">
                                <div className="flex items-center space-x-2">
                                    <span className="text-white font-medium">
                                        {player.name}
                                    </span>
                                    {player.badges?.map((badge) => (
                                        <div
                                            key={badge.id}
                                            className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${
                                                badge.color === "yellow"
                                                    ? "bg-yellow-500/20 text-yellow-400"
                                                    : badge.color === "red"
                                                    ? "bg-red-500/20 text-red-400"
                                                    : "bg-gray-500/20 text-gray-400"
                                            }`}
                                        >
                                            {getBadgeIcon(badge.name)}
                                            <span>{badge.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Wins */}
                        <div className="flex items-center">
                            <span className="text-white">{player.wins}</span>
                        </div>

                        {/* ETH won */}
                        <div className="flex items-center">
                            <span className="text-white">{player.xpWon}XP</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LeaderboardTable;

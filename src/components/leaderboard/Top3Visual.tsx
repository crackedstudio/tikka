import React from "react";
import type { TopPlayer } from "../../types/types";

interface Top3VisualProps {
    players: TopPlayer[];
}

const Top3Visual: React.FC<Top3VisualProps> = ({ players }) => {
    const getRankColor = (rank: number) => {
        switch (rank) {
            case 1:
                return "bg-gradient-to-b from-yellow-400 to-yellow-600";
            case 2:
                return "bg-gradient-to-b from-purple-400 to-purple-600";
            case 3:
                return "bg-gradient-to-b from-orange-400 to-orange-600";
            default:
                return "bg-gray-500";
        }
    };

    const getRankCircleColor = (rank: number) => {
        switch (rank) {
            case 1:
                return "bg-yellow-500";
            case 2:
                return "bg-purple-500";
            case 3:
                return "bg-orange-500";
            default:
                return "bg-gray-500";
        }
    };

    const getPositionClass = (rank: number) => {
        switch (rank) {
            case 1:
                return "order-2"; // Center
            case 2:
                return "order-1"; // Left
            case 3:
                return "order-3"; // Right
            default:
                return "";
        }
    };

    const getHeightClass = (rank: number) => {
        switch (rank) {
            case 1:
                return "h-32"; // Tallest
            case 2:
                return "h-28"; // Medium
            case 3:
                return "h-28"; // Medium
            default:
                return "h-24";
        }
    };

    return (
        <div className="flex items-end justify-center space-x-4 mb-8">
            {players.map((player) => (
                <div
                    key={player.id}
                    className={`flex flex-col items-center ${getPositionClass(
                        player.rank
                    )}`}
                >
                    {/* Avatar */}
                    <div className="w-16 h-16 rounded-full bg-white mb-3 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-gray-300"></div>
                    </div>

                    {/* Player Card */}
                    <div
                        className={`${getRankColor(
                            player.rank
                        )} rounded-lg p-4 w-32 ${getHeightClass(
                            player.rank
                        )} flex flex-col justify-between`}
                    >
                        <div className="text-center">
                            <h3 className="text-white font-semibold text-sm">
                                {player.name}
                            </h3>
                            <p className="text-white/80 text-xs">
                                {player.xp.toLocaleString()} XP
                            </p>
                        </div>

                        {/* Rank Circle */}
                        <div className="flex justify-center">
                            <div
                                className={`${getRankCircleColor(
                                    player.rank
                                )} w-8 h-8 rounded-full flex items-center justify-center`}
                            >
                                <span className="text-white font-bold text-lg">
                                    {player.rank}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default Top3Visual;

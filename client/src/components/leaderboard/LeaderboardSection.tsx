import React from "react";
import type { LeaderboardProps, TopPlayer, Player } from "../../types/types";
import Top3Visual from "./Top3Visual";
import LeaderboardTable from "./LeaderboardTable";

interface LeaderboardSectionProps extends LeaderboardProps {
    topPlayers: TopPlayer[];
    players: Player[];
}

const LeaderboardSection: React.FC<LeaderboardSectionProps> = ({
    activeTab,
    onTabChange,
    topPlayers,
    players,
}) => {
    const tabs = [
        { id: "weekly", label: "Weekly" },
        { id: "monthly", label: "Monthly" },
        { id: "alltime", label: "All Time" },
    ];

    return (
        <div className="flex-1">
            {/* Title */}
            <h1 className="text-4xl font-bold text-white mb-8">Leaderboard</h1>

            {/* Tabs */}
            <div className="flex space-x-1 mb-8">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
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

            {/* Top 3 Visual */}
            <Top3Visual players={topPlayers} />

            {/* Leaderboard Table */}
            <LeaderboardTable players={players} />
        </div>
    );
};

export default LeaderboardSection;

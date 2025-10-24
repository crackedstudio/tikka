import React, { useState } from "react";
import type {
    PlayerStats as PlayerStatsType,
    Achievement,
} from "../../types/types";

interface PlayerStatsProps {
    stats: PlayerStatsType;
    achievements: Achievement[];
}

const PlayerStats: React.FC<PlayerStatsProps> = ({ stats, achievements }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const progressPercentage = (stats.currentXp / stats.nextLevelXp) * 100;

    const getAchievementIcon = (icon: string) => {
        switch (icon) {
            case "ticket":
                return (
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                    </svg>
                );
            case "trophy":
                return (
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            case "share":
                return (
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                    </svg>
                );
            default:
                return null;
        }
    };

    if (isCollapsed) {
        return (
            <div className="bg-[#1E1932] rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <svg
                            className="w-4 h-4 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                        </svg>
                        <span className="text-white font-medium">
                            Player Stats
                        </span>
                    </div>
                    <button
                        onClick={() => setIsCollapsed(false)}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#1E1932] rounded-xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                    <svg
                        className="w-4 h-4 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                    </svg>
                    <span className="text-white font-medium">Player Stats</span>
                </div>
                <button
                    onClick={() => setIsCollapsed(true)}
                    className="text-gray-400 hover:text-white transition-colors"
                >
                    <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path
                            fillRule="evenodd"
                            d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                            clipRule="evenodd"
                        />
                    </svg>
                </button>
            </div>

            {/* User Profile */}
            <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                </div>
                <div>
                    <h3 className="text-white font-semibold">{stats.name}</h3>
                    <p className="text-gray-400 text-sm">{stats.joinedDate}</p>
                    <div className="flex items-center space-x-2 mt-1">
                        <div className="flex items-center space-x-1 bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs">
                            <svg
                                className="w-3 h-3"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                            </svg>
                            <span>{stats.tickets} Tickets</span>
                        </div>
                        <div className="flex items-center space-x-1 bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full text-xs">
                            <svg
                                className="w-3 h-3"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{stats.wins} Wins</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Level Progress */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">
                        Level {stats.level}
                    </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                    <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercentage}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                    <span>Current</span>
                    <span>Next Level: {stats.level + 1}</span>
                </div>
                <div className="text-center text-white font-semibold mt-1">
                    {stats.currentXp}/{stats.nextLevelXp} XP
                </div>
            </div>

            {/* Daily Login Streak */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-medium">
                        DAILY LOGIN STREAK
                    </span>
                    <span className="text-gray-400 text-sm">
                        {stats.dailyStreak} Days
                    </span>
                </div>
                <div className="flex justify-between mb-3">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                        (day, index) => (
                            <div
                                key={day}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                    stats.streakDays[index]
                                        ? "bg-yellow-500 text-white"
                                        : "bg-gray-600 text-gray-400"
                                }`}
                            >
                                {stats.streakDays[index] ? "✓" : day[0]}
                            </div>
                        )
                    )}
                </div>
                <button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200">
                    Claim 25 XP Bonus!
                </button>
            </div>

            {/* Recent Achievements */}
            <div>
                <h4 className="text-white font-medium mb-3">
                    RECENT ACHIEVEMENTS
                </h4>
                <div className="grid grid-cols-3 gap-2">
                    {achievements.map((achievement) => (
                        <div
                            key={achievement.id}
                            className={`p-3 rounded-lg text-center ${
                                achievement.color === "teal"
                                    ? "bg-teal-500/20"
                                    : achievement.color === "purple"
                                    ? "bg-purple-500/20"
                                    : "bg-yellow-500/20"
                            }`}
                        >
                            <div
                                className={`text-2xl mb-1 ${
                                    achievement.color === "teal"
                                        ? "text-teal-400"
                                        : achievement.color === "purple"
                                        ? "text-purple-400"
                                        : "text-yellow-400"
                                }`}
                            >
                                {getAchievementIcon(achievement.icon)}
                            </div>
                            <div className="text-white text-xs font-medium">
                                {achievement.name}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PlayerStats;

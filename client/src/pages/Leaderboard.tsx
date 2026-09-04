import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLeaderboard } from "../hooks/useLeaderboard";
import type { LeaderboardSortBy } from "../services/leaderboardService";
import { ErrorMessage, EmptyState, Skeleton } from "../components/ui";
import { Trophy } from "lucide-react";

const Leaderboard: React.FC = () => {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<LeaderboardSortBy>("wins");
  const [limit] = useState(100);

  const { data, isLoading, error, refetch } = useLeaderboard({ by: sortBy, limit });

  const entries = data?.entries || [];

  const shortenAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatVolume = (volume?: string) => {
    if (!volume) return "0";
    const num = parseFloat(volume);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen text-gray-900 dark:text-white">
      <div className="w-full max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
          {t("leaderboard.title")}
        </h1>

        {/* Sort Options */}
        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setSortBy("wins")}
            className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E] ${
              sortBy === "wins"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {t("leaderboard.sortByWins")}
          </button>
          <button
            onClick={() => setSortBy("volume")}
            className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E] ${
              sortBy === "volume"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {t("leaderboard.sortByVolume")}
          </button>
          <button
            onClick={() => setSortBy("tickets")}
            className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E] ${
              sortBy === "tickets"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {t("leaderboard.sortByTickets")}
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden p-6 space-y-4">
            <Skeleton className="h-12 w-full rounded" />
            <Skeleton className="h-12 w-full rounded" />
            <Skeleton className="h-12 w-full rounded" />
            <Skeleton className="h-12 w-full rounded" />
            <Skeleton className="h-12 w-full rounded" />
          </div>
        ) : error ? (
          <ErrorMessage
            title={t("leaderboard.errorTitle")}
            message={error.message}
            onRetry={refetch}
            disabled={isLoading}
          />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Trophy className="w-8 h-8 text-gray-400" />}
            title="No Leaderboard Data Yet"
            hint="The leaderboard will populate as users participate in raffles."
          />
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t("leaderboard.rank")}
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t("leaderboard.address")}
                    </th>
                    {sortBy === "wins" && (
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {t("leaderboard.wins")}
                      </th>
                    )}
                    {sortBy === "volume" && (
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {t("leaderboard.volume")}
                      </th>
                    )}
                    {sortBy === "tickets" && (
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {t("leaderboard.tickets")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {entries.map((entry, index) => (
                    <tr
                      key={entry.address}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        {entry.rank || index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={`https://stellar.expert/explorer/public/account/${entry.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-mono text-purple-600 dark:text-purple-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF389C] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#11172E]"
                          title={entry.address}
                        >
                          {shortenAddress(entry.address)}
                        </a>
                      </td>
                      {sortBy === "wins" && (
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-white font-semibold">
                          {entry.total_wins || 0}
                        </td>
                      )}
                      {sortBy === "volume" && (
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-white font-semibold">
                          {formatVolume(entry.total_volume_xlm)}
                        </td>
                      )}
                      {sortBy === "tickets" && (
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-white font-semibold">
                          {entry.total_tickets || 0}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;

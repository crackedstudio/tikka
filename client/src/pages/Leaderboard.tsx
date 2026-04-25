import React, { useState } from "react";
import { useLeaderboard } from "../hooks/useLeaderboard";
import type { LeaderboardSortBy } from "../services/leaderboardService";
import ErrorMessage from "../components/ui/ErrorMessage";

const Leaderboard: React.FC = () => {
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
          Leaderboard
        </h1>

        {/* Sort Options */}
        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setSortBy("wins")}
            className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 ${
              sortBy === "wins"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            By Wins
          </button>
          <button
            onClick={() => setSortBy("volume")}
            className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 ${
              sortBy === "volume"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            By Volume
          </button>
          <button
            onClick={() => setSortBy("tickets")}
            className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 ${
              sortBy === "tickets"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            By Tickets
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gray-600 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-gray-900 dark:text-white text-xl font-semibold mb-2">
              Loading Leaderboard...
            </h3>
          </div>
        ) : error ? (
          <ErrorMessage
            title="Error Loading Leaderboard"
            message={error.message}
            onRetry={refetch}
            disabled={isLoading}
          />
        ) : entries.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
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
              No Leaderboard Data Yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              The leaderboard will populate as users participate in raffles.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Rank
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Address
                    </th>
                    {sortBy === "wins" && (
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Wins
                      </th>
                    )}
                    {sortBy === "volume" && (
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Volume (XLM)
                      </th>
                    )}
                    {sortBy === "tickets" && (
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Tickets
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
                          className="text-sm font-mono text-purple-600 dark:text-purple-400 hover:underline"
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

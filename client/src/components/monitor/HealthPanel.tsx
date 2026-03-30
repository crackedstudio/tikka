import type { QueueStatsResponse } from '../../services/monitorApi';

interface HealthPanelProps {
  stats: QueueStatsResponse | null;
  error: string | null;
}

interface StatCardProps {
  label: string;
  value: number;
  accent: string;
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-gray-300 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-5">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`text-3xl font-bold ${accent}`}>{value}</span>
    </div>
  );
}

const HealthPanel = ({ stats, error }: HealthPanelProps) => {
  if (!stats && error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-950/40 px-5 py-4 text-red-400">
        Oracle service unavailable
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={stats.pending} accent="text-yellow-400" />
        <StatCard label="Completed" value={stats.completed} accent="text-green-400" />
        <StatCard label="Failed" value={stats.failed} accent="text-red-400" />
      </div>
      <p className="text-xs text-gray-500">
        Last updated: {new Date(stats.timestamp).toLocaleString()}
      </p>
    </div>
  );
};

export default HealthPanel;

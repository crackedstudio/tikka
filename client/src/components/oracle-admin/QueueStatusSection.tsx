import type { OracleStatus } from '../../services/oracleApi';

interface QueueStatusSectionProps {
  pendingCount: number;
  activeCount: number;
  failedCount: number;
  circuitState?: string;
}

export function QueueStatusSection({
  pendingCount,
  activeCount,
  failedCount,
  circuitState,
}: QueueStatusSectionProps) {
  const getCircuitBreakerColor = (state?: string) => {
    switch (state) {
      case 'closed':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
      case 'open':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400';
      case 'half-open':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400';
    }
  };

  return (
    <section className="mb-8" data-testid="queue-status-section">
      <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">Queue Status</h2>
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-6 py-4 flex items-center gap-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="pending-count">{pendingCount}</p>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-6 py-4 flex items-center gap-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="active-count">{activeCount}</p>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-6 py-4 flex items-center gap-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Failed</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="failed-count">{failedCount}</p>
          </div>
        </div>
        {circuitState && (
          <div
            data-testid="circuit-breaker-badge"
            className={`rounded-lg border border-gray-200 dark:border-[#2A264A] px-6 py-4 flex items-center gap-3 ${getCircuitBreakerColor(
              circuitState,
            )}`}
          >
            <div>
              <p className="text-sm font-medium">Circuit Breaker</p>
              <p className="text-lg font-semibold uppercase">{circuitState}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

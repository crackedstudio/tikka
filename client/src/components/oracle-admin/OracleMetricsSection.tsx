import type { OracleStatus } from '../../services/oracleApi';

interface OracleMetricsSectionProps {
  oracleStatus: OracleStatus;
}

export function OracleMetricsSection({ oracleStatus }: OracleMetricsSectionProps) {
  return (
    <section className="mb-8" data-testid="oracle-metrics-section">
      <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">Oracle Status</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="oracle-status">
            {oracleStatus.status}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Processed</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="total-processed">
            {oracleStatus.metrics.totalProcessed}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Failed</p>
          <p className="text-lg font-semibold text-red-600 dark:text-red-400" data-testid="total-failed">
            {oracleStatus.metrics.totalFailed}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
          <p className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="success-rate">
            {oracleStatus.metrics.successRate}
          </p>
        </div>
      </div>
    </section>
  );
}

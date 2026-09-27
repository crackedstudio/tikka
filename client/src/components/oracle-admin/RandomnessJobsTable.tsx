import type { RandomnessJobInfo } from '../../services/oracleApi';

interface RandomnessJobsTableProps {
  jobs: RandomnessJobInfo[];
  isAdmin: boolean;
  onRescueClick: (job: RandomnessJobInfo, action: 're-enqueue' | 'force-fail') => void;
  onForceSubmitClick: (job: RandomnessJobInfo) => void;
}

export function RandomnessJobsTable({
  jobs,
  isAdmin,
  onRescueClick,
  onForceSubmitClick,
}: RandomnessJobsTableProps) {
  return (
    <section className="mb-8" data-testid="randomness-jobs-section">
      <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">Last 20 Randomness Jobs</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A]">
        <table className="w-full text-sm text-gray-900 dark:text-white" data-testid="jobs-table">
          <thead>
            <tr className="border-b border-gray-200 dark:border-[#2A264A] bg-gray-50 dark:bg-[#0D0A1E]">
              <th className="px-6 py-3 text-left font-semibold">Raffle ID</th>
              <th className="px-6 py-3 text-left font-semibold">Request ID</th>
              <th className="px-6 py-3 text-left font-semibold">State</th>
              <th className="px-6 py-3 text-left font-semibold">Created</th>
              <th className="px-6 py-3 text-left font-semibold">Retries</th>
              {isAdmin && <th className="px-6 py-3 text-left font-semibold" data-testid="actions-header">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
                  No jobs found
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr
                  key={job.id}
                  data-testid={`job-row-${job.id}`}
                  className="border-b border-gray-200 dark:border-[#2A264A] hover:bg-gray-50 dark:hover:bg-[#1A1633]"
                >
                  <td className="px-6 py-3 font-medium">{job.raffleId}</td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                    {job.requestId.substring(0, 16)}...
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        job.state === 'failed'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                          : job.state === 'active'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                          : job.state === 'waiting'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                          : 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {job.state}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs">
                    {new Date(job.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-center">{job.attempts}</td>
                  {isAdmin && (
                    <td className="px-6 py-3" data-testid={`actions-cell-${job.id}`}>
                      <div className="flex gap-2">
                        {job.state === 'failed' && (
                          <>
                            <button
                              onClick={() => onRescueClick(job, 're-enqueue')}
                              data-testid={`re-queue-btn-${job.id}`}
                              className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            >
                              Re-queue
                            </button>
                            <button
                              onClick={() => onForceSubmitClick(job)}
                              data-testid={`force-submit-btn-${job.id}`}
                              className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                            >
                              Force Submit
                            </button>
                          </>
                        )}
                        {(job.state === 'active' || job.state === 'waiting') && (
                          <button
                            onClick={() => onRescueClick(job, 'force-fail')}
                            data-testid={`force-fail-btn-${job.id}`}
                            className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            Force Fail
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

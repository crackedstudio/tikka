import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AdminLogin from '../components/AdminLogin';
import Modal from '../components/modals/Modal';
import ErrorMessage from '../components/ui/ErrorMessage';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import {
  fetchRandomnessJobs,
  fetchOracleStatus,
  reEnqueueJob,
  forceSubmitRandomness,
  forceFailJob,
  type RandomnessJobInfo,
  type JobsByState,
  type OracleStatus,
} from '../services/oracleApi';

interface RescueModalState {
  isOpen: boolean;
  jobId?: string;
  raffleId?: number;
  requestId?: string;
  action?: 're-enqueue' | 'force-submit' | 'force-fail';
  reason?: string;
  isSubmitting?: boolean;
}

function Dashboard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobsByState | null>(null);
  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescueModal, setRescueModal] = useState<RescueModalState>({ isOpen: false });
  const [operatorName, setOperatorName] = useState('');

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [jobsData, statusData] = await Promise.all([
        fetchRandomnessJobs(),
        fetchOracleStatus(),
      ]);
      setJobs(jobsData);
      setOracleStatus(statusData);
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load oracle data';
      setError(message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSignOut = () => {
    sessionStorage.removeItem('admin_token');
    window.location.reload();
  };

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

  const handleRescueClick = (job: RandomnessJobInfo, action: 're-enqueue' | 'force-fail') => {
    setRescueModal({
      isOpen: true,
      jobId: job.id,
      raffleId: job.raffleId,
      requestId: job.requestId,
      action,
      reason: '',
    });
  };

  const handleForceSubmitClick = (job: RandomnessJobInfo) => {
    setRescueModal({
      isOpen: true,
      jobId: job.id,
      raffleId: job.raffleId,
      requestId: job.requestId,
      action: 'force-submit',
      reason: '',
    });
  };

  const handleRescueSubmit = async () => {
    if (!operatorName.trim()) {
      toast.error('Please enter operator name');
      return;
    }

    if (!rescueModal.reason?.trim()) {
      toast.error('Please enter a reason');
      return;
    }

    setRescueModal((prev) => ({ ...prev, isSubmitting: true }));

    try {
      let result;
      switch (rescueModal.action) {
        case 're-enqueue':
          result = await reEnqueueJob(
            rescueModal.jobId!,
            operatorName.trim(),
            rescueModal.reason.trim(),
          );
          break;
        case 'force-submit':
          result = await forceSubmitRandomness(
            rescueModal.raffleId!,
            rescueModal.requestId!,
            operatorName.trim(),
            rescueModal.reason.trim(),
          );
          break;
        case 'force-fail':
          result = await forceFailJob(
            rescueModal.jobId!,
            operatorName.trim(),
            rescueModal.reason.trim(),
          );
          break;
      }

      if (result?.success) {
        toast.success(`${rescueModal.action === 're-enqueue' ? 'Job re-enqueued' : rescueModal.action === 'force-submit' ? 'Randomness submitted' : 'Job failed'} successfully`);
        setRescueModal({ isOpen: false });
        setOperatorName('');
        setTimeout(loadData, 1000);
      } else {
        toast.error(result?.message || 'Operation failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rescue operation failed';
      toast.error(message);
    } finally {
      setRescueModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const allJobs = jobs
    ? [
        ...jobs.failed.slice(0, 20),
        ...jobs.active.slice(0, Math.max(0, 20 - jobs.failed.length)),
        ...jobs.waiting.slice(0, Math.max(0, 20 - jobs.failed.length - jobs.active.length)),
      ]
    : [];

  const pendingCount = jobs ? (jobs.waiting.length + jobs.active.length) : 0;
  const activeCount = jobs ? jobs.active.length : 0;
  const failedCount = jobs ? jobs.failed.length : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0D0A1E] px-4 py-8 text-gray-900 dark:text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <Breadcrumbs />
        </div>

        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Oracle Admin Dashboard
          </h1>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-gray-300 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-4 py-2 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:bg-[#1E1840] hover:text-gray-900 dark:text-white"
          >
            Sign Out
          </button>
        </div>

        {error && <ErrorMessage error={error} />}

        {loading && (
          <div className="mb-6 flex items-center gap-2 text-gray-400">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm">Loading...</span>
          </div>
        )}

        {/* Queue Depth Badges */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Queue Status</h2>
          <div className="flex gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-6 py-4 flex items-center gap-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</p>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-6 py-4 flex items-center gap-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-6 py-4 flex items-center gap-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Failed</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{failedCount}</p>
              </div>
            </div>
            {oracleStatus?.circuitState && (
              <div
                className={`rounded-lg border border-gray-200 dark:border-[#2A264A] px-6 py-4 flex items-center gap-3 ${getCircuitBreakerColor(oracleStatus.circuitState)}`}
              >
                <div>
                  <p className="text-sm font-medium">Circuit Breaker</p>
                  <p className="text-lg font-semibold uppercase">{oracleStatus.circuitState}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Randomness Jobs Table */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Last 20 Randomness Jobs</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A]">
            <table className="w-full text-sm text-gray-900 dark:text-white">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#2A264A] bg-gray-50 dark:bg-[#0D0A1E]">
                  <th className="px-6 py-3 text-left font-semibold">Raffle ID</th>
                  <th className="px-6 py-3 text-left font-semibold">Request ID</th>
                  <th className="px-6 py-3 text-left font-semibold">State</th>
                  <th className="px-6 py-3 text-left font-semibold">Created</th>
                  <th className="px-6 py-3 text-left font-semibold">Retries</th>
                  <th className="px-6 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No jobs found
                    </td>
                  </tr>
                ) : (
                  allJobs.map((job) => (
                    <tr
                      key={job.id}
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
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          {job.state === 'failed' && (
                            <>
                              <button
                                onClick={() => handleRescueClick(job, 're-enqueue')}
                                className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                              >
                                Re-queue
                              </button>
                              <button
                                onClick={() => handleForceSubmitClick(job)}
                                className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                              >
                                Force Submit
                              </button>
                            </>
                          )}
                          {(job.state === 'active' || job.state === 'waiting') && (
                            <button
                              onClick={() => handleRescueClick(job, 'force-fail')}
                              className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
                            >
                              Force Fail
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Oracle Status */}
        {oracleStatus && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-200">Oracle Status</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {oracleStatus.status}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Processed</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {oracleStatus.metrics.totalProcessed}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Failed</p>
                <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                  {oracleStatus.metrics.totalFailed}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {oracleStatus.metrics.successRate}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Rescue Modal */}
      <Modal open={rescueModal.isOpen} onClose={() => setRescueModal({ isOpen: false })}>
        <div className="w-full max-w-md rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            {rescueModal.action === 're-enqueue'
              ? 'Re-enqueue Job'
              : rescueModal.action === 'force-submit'
              ? 'Force Submit Randomness'
              : 'Force Fail Job'}
          </h3>

          <div className="mb-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
            {rescueModal.raffleId && <p>Raffle ID: {rescueModal.raffleId}</p>}
            {rescueModal.requestId && <p>Request ID: {rescueModal.requestId.substring(0, 32)}...</p>}
          </div>

          <div className="mb-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Operator Name
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Your name"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-[#2A264A] bg-gray-50 dark:bg-[#0D0A1E] px-4 py-2 text-gray-900 dark:text-white placeholder-gray-500 outline-none focus:border-[#5B4FCF] focus:ring-1 focus:ring-[#5B4FCF]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Reason
              </label>
              <textarea
                value={rescueModal.reason || ''}
                onChange={(e) =>
                  setRescueModal({ ...rescueModal, reason: e.target.value })
                }
                placeholder="Why are you performing this action?"
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-[#2A264A] bg-gray-50 dark:bg-[#0D0A1E] px-4 py-2 text-gray-900 dark:text-white placeholder-gray-500 outline-none focus:border-[#5B4FCF] focus:ring-1 focus:ring-[#5B4FCF]"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setRescueModal({ isOpen: false })}
              disabled={rescueModal.isSubmitting}
              className="flex-1 rounded-lg border border-gray-300 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-[#1A1633] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleRescueSubmit}
              disabled={rescueModal.isSubmitting || !operatorName.trim() || !rescueModal.reason?.trim()}
              className="flex-1 rounded-lg bg-[#5B4FCF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6B5FDF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rescueModal.isSubmitting ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function OracleAdmin() {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(
    () => !!sessionStorage.getItem('admin_token'),
  );

  // Guard: redirect if not authenticated
  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  }

  return <Dashboard />;
}

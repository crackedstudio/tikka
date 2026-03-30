import { useState } from 'react';
import AdminLogin from '../components/AdminLogin';
import HealthPanel from '../components/monitor/HealthPanel';
import LatencyGraph from '../components/monitor/LatencyGraph';
import ErrorTable from '../components/monitor/ErrorTable';
import { useMonitor } from '../hooks/useMonitor';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';

function Dashboard() {
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);

  const { stats, latencyData, errors, loading, error } = useMonitor({ from, to });

  const handleSignOut = () => {
    sessionStorage.removeItem('admin_token');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0D0A1E] px-4 py-8 text-gray-900 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <Breadcrumbs />
        </div>
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Oracle Admin Dashboard</h1>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-gray-300 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-4 py-2 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:bg-[#1E1840] hover:text-gray-900 dark:text-white"
          >
            Sign Out
          </button>
        </div>

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

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Health</h2>
          <HealthPanel stats={stats} error={error} />
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Reveal Latency</h2>
          <LatencyGraph
            latencyData={latencyData}
            onRangeChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Submission Errors</h2>
          <ErrorTable errors={errors} />
        </section>
      </div>
    </div>
  );
}

export default function OracleAdmin() {
  const [authenticated, setAuthenticated] = useState(
    () => !!sessionStorage.getItem('admin_token'),
  );

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  }

  return <Dashboard />;
}

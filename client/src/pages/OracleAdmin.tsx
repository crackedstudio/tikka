import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AdminLogin from '../components/AdminLogin';
import ErrorMessage from '../components/ui/ErrorMessage';
import { Breadcrumbs } from '../components/ui/Breadcrumbs';
import { useOracleAdmin } from '../hooks/useOracleAdmin';
import { QueueStatusSection } from '../components/oracle-admin/QueueStatusSection';
import { RandomnessJobsTable } from '../components/oracle-admin/RandomnessJobsTable';
import { OracleMetricsSection } from '../components/oracle-admin/OracleMetricsSection';
import { RescueModal, type RescueModalState } from '../components/oracle-admin/RescueModal';
import type { RandomnessJobInfo } from '../services/oracleApi';

function Dashboard({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  const { t } = useTranslation('oracle');
  const { t: tErrors } = useTranslation('errors');
  const {
    jobs,
    oracleStatus,
    loading,
    error,
    reEnqueue,
    forceSubmit,
    forceFail,
    isAdmin,
  } = useOracleAdmin();

  const [rescueModal, setRescueModal] = useState<RescueModalState>({ isOpen: false });
  const [operatorName, setOperatorName] = useState('');

  const handleRescueClick = (
    job: RandomnessJobInfo,
    action: 're-enqueue' | 'force-fail',
  ) => {
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

  const handleRescueSubmit = useCallback(async () => {
    if (!isAdmin) {
      toast.error(tErrors('adminSessionRequired'));
      return;
    }

    if (!operatorName.trim()) {
      toast.error(tErrors('enterOperatorName'));
      return;
    }

    if (!rescueModal.reason?.trim()) {
      toast.error(tErrors('enterReason'));
      return;
    }

    setRescueModal((prev) => ({ ...prev, isSubmitting: true }));

    try {
      let result;
      switch (rescueModal.action) {
        case 're-enqueue':
          result = await reEnqueue(
            rescueModal.jobId!,
            operatorName.trim(),
            rescueModal.reason.trim(),
          );
          break;
        case 'force-submit':
          result = await forceSubmit(
            rescueModal.raffleId!,
            rescueModal.requestId!,
            operatorName.trim(),
            rescueModal.reason.trim(),
          );
          break;
        case 'force-fail':
          result = await forceFail(
            rescueModal.jobId!,
            operatorName.trim(),
            rescueModal.reason.trim(),
          );
          break;
      }

      if (result?.success) {
        const actionText =
          rescueModal.action === 're-enqueue'
            ? 'Job re-enqueued'
            : rescueModal.action === 'force-submit'
            ? 'Randomness submitted'
            : 'Job failed';
        toast.success(`${actionText} successfully`);
        setRescueModal({ isOpen: false });
        setOperatorName('');
      } else {
        toast.error(result?.message || tErrors('operationFailed'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : tErrors('rescueOperationFailed');
      toast.error(message);
    } finally {
      setRescueModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  }, [isAdmin, operatorName, rescueModal, reEnqueue, forceSubmit, forceFail, tErrors]);

  const allJobs = jobs
    ? [
        ...jobs.failed.slice(0, 20),
        ...jobs.active.slice(0, Math.max(0, 20 - jobs.failed.length)),
        ...jobs.waiting.slice(0, Math.max(0, 20 - jobs.failed.length - jobs.active.length)),
      ]
    : [];

  const pendingCount = jobs ? jobs.waiting.length + jobs.active.length : 0;
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
            {t('dashboard.title')}
          </h1>
          <button
            onClick={onSignOut}
            data-testid="sign-out-btn"
            className="rounded-lg border border-gray-300 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-4 py-2 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-[#1E1840]"
          >
            {t('dashboard.signOut')}
          </button>
        </div>

        {error && <ErrorMessage message={error} />}

        {loading && (
          <div className="mb-6 flex items-center gap-2 text-gray-400" data-testid="loading-indicator">
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
            <span className="text-sm">{t('dashboard.loading')}</span>
          </div>
        )}

        <QueueStatusSection
          pendingCount={pendingCount}
          activeCount={activeCount}
          failedCount={failedCount}
          circuitState={oracleStatus?.circuitState}
        />

        <RandomnessJobsTable
          jobs={allJobs}
          isAdmin={isAdmin}
          onRescueClick={handleRescueClick}
          onForceSubmitClick={handleForceSubmitClick}
        />

        {oracleStatus && <OracleMetricsSection oracleStatus={oracleStatus} />}
      </div>

      <RescueModal
        state={rescueModal}
        operatorName={operatorName}
        onOperatorNameChange={setOperatorName}
        onReasonChange={(reason) =>
          setRescueModal((prev) => ({ ...prev, reason }))
        }
        onClose={() => setRescueModal({ isOpen: false })}
        onSubmit={handleRescueSubmit}
        isAdmin={isAdmin}
      />
    </div>
  );
}

export default function OracleAdmin() {
  const [authenticated, setAuthenticated] = useState(
    () => typeof window !== 'undefined' && !!sessionStorage.getItem('admin_token'),
  );

  const handleSignOut = () => {
    sessionStorage.removeItem('admin_token');
    setAuthenticated(false);
  };

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  }

  return <Dashboard onSignOut={handleSignOut} />;
}

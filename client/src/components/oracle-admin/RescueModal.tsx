import { useState, useEffect } from 'react';
import Modal from '../modals/Modal';

export interface RescueModalState {
  isOpen: boolean;
  jobId?: string;
  raffleId?: number;
  requestId?: string;
  action?: 're-enqueue' | 'force-submit' | 'force-fail';
  reason?: string;
  isSubmitting?: boolean;
}

export interface RescueModalProps {
  state: RescueModalState;
  operatorName: string;
  onOperatorNameChange: (name: string) => void;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  isAdmin: boolean;
}

export function RescueModal({
  state,
  operatorName,
  onOperatorNameChange,
  onReasonChange,
  onClose,
  onSubmit,
  isAdmin,
}: RescueModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (state.isOpen) {
      setConfirmed(false);
    }
  }, [state.isOpen]);

  if (!state.isOpen) return null;

  const getActionTitle = () => {
    switch (state.action) {
      case 're-enqueue':
        return 'Re-enqueue Job';
      case 'force-submit':
        return 'Force Submit Randomness (Onchain Action)';
      case 'force-fail':
        return 'Force Fail Job';
      default:
        return 'Admin Rescue Operation';
    }
  };

  const getConfirmationWarning = () => {
    switch (state.action) {
      case 'force-submit':
        return 'WARNING: This will submit randomness directly to the Soroban contract onchain. Ensure all parameters are valid.';
      case 'force-fail':
        return 'WARNING: Marking this job as failed will terminate retry attempts and mark the draw attempt as failed.';
      case 're-enqueue':
        return 'Notice: Re-enqueuing will reset retry attempts and push the job back into the active queue.';
      default:
        return 'This is a privileged administrative operation.';
    }
  };

  const canSubmit =
    isAdmin &&
    !state.isSubmitting &&
    operatorName.trim().length > 0 &&
    (state.reason ?? '').trim().length > 0 &&
    confirmed;

  return (
    <Modal open={state.isOpen} onClose={onClose}>
      <div className="w-full max-w-md rounded-lg border border-gray-200 dark:border-[#2A264A] bg-white dark:bg-[#15102A] p-6" data-testid="rescue-modal">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white" data-testid="rescue-modal-title">
          {getActionTitle()}
        </h3>

        <div className="mb-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          {state.raffleId !== undefined && (
            <p data-testid="modal-raffle-id">Raffle ID: <span className="font-semibold text-gray-900 dark:text-white">{state.raffleId}</span></p>
          )}
          {state.requestId && (
            <p data-testid="modal-request-id">Request ID: <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{state.requestId.substring(0, 32)}...</span></p>
          )}
          {state.jobId && (
            <p data-testid="modal-job-id">Job ID: <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{state.jobId}</span></p>
          )}
        </div>

        <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-3 text-xs text-amber-800 dark:text-amber-300" data-testid="confirmation-warning">
          {getConfirmationWarning()}
        </div>

        <div className="mb-4 space-y-4">
          <div>
            <label htmlFor="operator-name-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Operator Name
            </label>
            <input
              id="operator-name-input"
              data-testid="operator-name-input"
              type="text"
              value={operatorName}
              onChange={(e) => onOperatorNameChange(e.target.value)}
              placeholder="Your name"
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-[#2A264A] bg-gray-50 dark:bg-[#0D0A1E] px-4 py-2 text-gray-900 dark:text-white placeholder-gray-500 outline-none focus:border-[#5B4FCF] focus:ring-1 focus:ring-[#5B4FCF] disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="reason-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reason
            </label>
            <textarea
              id="reason-input"
              data-testid="reason-input"
              value={state.reason || ''}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Why are you performing this action?"
              rows={3}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-[#2A264A] bg-gray-50 dark:bg-[#0D0A1E] px-4 py-2 text-gray-900 dark:text-white placeholder-gray-500 outline-none focus:border-[#5B4FCF] focus:ring-1 focus:ring-[#5B4FCF] disabled:opacity-50"
            />
          </div>

          <div className="flex items-start gap-2 pt-2 border-t border-gray-200 dark:border-[#2A264A]">
            <input
              id="confirm-action-checkbox"
              data-testid="confirm-action-checkbox"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={!isAdmin}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5B4FCF] focus:ring-[#5B4FCF]"
            />
            <label htmlFor="confirm-action-checkbox" className="text-xs text-gray-700 dark:text-gray-300">
              I confirm that I am authorized and intend to execute this privileged action.
            </label>
          </div>
        </div>

        {!isAdmin && (
          <div className="mb-4 text-xs font-semibold text-red-600 dark:text-red-400" data-testid="modal-unauthorized-message">
            Non-admin sessions cannot execute privileged actions.
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={state.isSubmitting}
            data-testid="cancel-rescue-btn"
            className="flex-1 rounded-lg border border-gray-300 dark:border-[#2A264A] bg-white dark:bg-[#15102A] px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-[#1A1633] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="confirm-rescue-btn"
            className="flex-1 rounded-lg bg-[#5B4FCF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6B5FDF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.isSubmitting ? 'Processing...' : 'Confirm Action'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

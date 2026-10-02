import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import OracleAdmin from './OracleAdmin';
import * as oracleApi from '../services/oracleApi';

vi.mock('../services/oracleApi', () => ({
  fetchRandomnessJobs: vi.fn(),
  fetchOracleStatus: vi.fn(),
  reEnqueueJob: vi.fn(),
  forceSubmitRandomness: vi.fn(),
  forceFailJob: vi.fn(),
}));

describe('OracleAdmin Page', () => {
  const mockJobs = {
    waiting: [],
    active: [{ id: 'job-active-1', raffleId: 10, requestId: 'req-active-10', state: 'active' as const, timestamp: Date.now(), attempts: 1 }],
    failed: [{ id: 'job-failed-1', raffleId: 11, requestId: 'req-failed-11', state: 'failed' as const, timestamp: Date.now(), attempts: 3 }],
  };

  const mockStatus = {
    status: 'healthy' as const,
    components: [],
    circuitState: 'closed' as const,
    metrics: { totalProcessed: 100, totalFailed: 2, successRate: '98%' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    let modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.setAttribute('id', 'modal-root');
      document.body.appendChild(modalRoot);
    }
    vi.mocked(oracleApi.fetchRandomnessJobs).mockResolvedValue(mockJobs);
    vi.mocked(oracleApi.fetchOracleStatus).mockResolvedValue(mockStatus);
  });

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <OracleAdmin />
      </MemoryRouter>,
    );
  };

  it('GATING: renders AdminLogin when session is not authenticated', () => {
    renderPage();

    expect(screen.getByText('Oracle Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Admin Token')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

    expect(screen.queryByTestId('queue-status-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('randomness-jobs-section')).not.toBeInTheDocument();
  });

  it('authenticates when valid token is submitted via AdminLogin', async () => {
    renderPage();

    const input = screen.getByLabelText('Admin Token');
    fireEvent.change(input, { target: { value: 'admin-secret-token' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId('queue-status-section')).toBeInTheDocument();
    });

    expect(sessionStorage.getItem('admin_token')).toBe('admin-secret-token');
    expect(screen.getByTestId('randomness-jobs-section')).toBeInTheDocument();
  });

  it('PRIVILEGED CONTROLS & CONFIRMATION: opens modal and requires mandatory confirmation step', async () => {
    sessionStorage.setItem('admin_token', 'admin-secret-token');
    vi.mocked(oracleApi.forceSubmitRandomness).mockResolvedValue({ success: true, message: 'Done' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('force-submit-btn-job-failed-1')).toBeInTheDocument();
    });

    const forceSubmitBtn = screen.getByTestId('force-submit-btn-job-failed-1');
    fireEvent.click(forceSubmitBtn);

    expect(screen.getByTestId('rescue-modal')).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('confirm-rescue-btn');
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId('operator-name-input'), { target: { value: 'Operator Bob' } });
    fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'Manual recovery' } });

    expect(confirmBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId('confirm-action-checkbox'));
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(oracleApi.forceSubmitRandomness).toHaveBeenCalledWith(
        11,
        'req-failed-11',
        'Operator Bob',
        'Manual recovery',
      );
    });
  });

  it('SIGN OUT: removes token from sessionStorage and returns to login gate', async () => {
    sessionStorage.setItem('admin_token', 'admin-secret-token');
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('sign-out-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('sign-out-btn'));

    expect(sessionStorage.getItem('admin_token')).toBeNull();
    expect(screen.getByLabelText('Admin Token')).toBeInTheDocument();
    expect(screen.queryByTestId('queue-status-section')).not.toBeInTheDocument();
  });
});

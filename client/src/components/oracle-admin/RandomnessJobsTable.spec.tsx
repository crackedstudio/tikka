import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RandomnessJobsTable } from './RandomnessJobsTable';
import type { RandomnessJobInfo } from '../../services/oracleApi';

describe('RandomnessJobsTable Component', () => {
  const mockJobs: RandomnessJobInfo[] = [
    {
      id: 'failed-job-1',
      raffleId: 101,
      requestId: 'req-failed-101',
      state: 'failed',
      timestamp: Date.now(),
      attempts: 3,
    },
    {
      id: 'active-job-2',
      raffleId: 102,
      requestId: 'req-active-102',
      state: 'active',
      timestamp: Date.now(),
      attempts: 1,
    },
  ];

  const mockOnRescueClick = vi.fn();
  const mockOnForceSubmitClick = vi.fn();

  it('HIDDEN PRIVILEGED CONTROLS: hides all action buttons and actions header when isAdmin is false', () => {
    render(
      <RandomnessJobsTable
        jobs={mockJobs}
        isAdmin={false}
        onRescueClick={mockOnRescueClick}
        onForceSubmitClick={mockOnForceSubmitClick}
      />,
    );

    expect(screen.queryByTestId('actions-header')).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();

    expect(screen.queryByTestId('re-queue-btn-failed-job-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('force-submit-btn-failed-job-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('force-fail-btn-active-job-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Re-queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Force Submit')).not.toBeInTheDocument();
    expect(screen.queryByText('Force Fail')).not.toBeInTheDocument();
  });

  it('renders privileged controls when isAdmin is true', () => {
    render(
      <RandomnessJobsTable
        jobs={mockJobs}
        isAdmin={true}
        onRescueClick={mockOnRescueClick}
        onForceSubmitClick={mockOnForceSubmitClick}
      />,
    );

    expect(screen.getByTestId('actions-header')).toBeInTheDocument();
    expect(screen.getByTestId('re-queue-btn-failed-job-1')).toBeInTheDocument();
    expect(screen.getByTestId('force-submit-btn-failed-job-1')).toBeInTheDocument();
    expect(screen.getByTestId('force-fail-btn-active-job-2')).toBeInTheDocument();
  });

  it('calls handlers when privileged buttons are clicked by admin', () => {
    render(
      <RandomnessJobsTable
        jobs={mockJobs}
        isAdmin={true}
        onRescueClick={mockOnRescueClick}
        onForceSubmitClick={mockOnForceSubmitClick}
      />,
    );

    fireEvent.click(screen.getByTestId('re-queue-btn-failed-job-1'));
    expect(mockOnRescueClick).toHaveBeenCalledWith(mockJobs[0], 're-enqueue');

    fireEvent.click(screen.getByTestId('force-submit-btn-failed-job-1'));
    expect(mockOnForceSubmitClick).toHaveBeenCalledWith(mockJobs[0]);

    fireEvent.click(screen.getByTestId('force-fail-btn-active-job-2'));
    expect(mockOnRescueClick).toHaveBeenCalledWith(mockJobs[1], 'force-fail');
  });
});

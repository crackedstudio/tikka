import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RescueModal, type RescueModalState, type RescueModalProps } from './RescueModal';

describe('RescueModal Component', () => {
  const defaultState: RescueModalState = {
    isOpen: true,
    jobId: 'job-999',
    raffleId: 42,
    requestId: 'req-42-xyz',
    action: 'force-submit',
    reason: '',
  };

  const mockOnOperatorNameChange = vi.fn();
  const mockOnReasonChange = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    let modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.setAttribute('id', 'modal-root');
      document.body.appendChild(modalRoot);
    }
  });

  function TestWrapper(props: Partial<RescueModalProps>) {
    const [operatorName, setOperatorName] = useState(props.operatorName ?? '');
    const [state, setState] = useState(props.state ?? defaultState);

    return (
      <RescueModal
        state={state}
        operatorName={operatorName}
        onOperatorNameChange={(name) => {
          setOperatorName(name);
          props.onOperatorNameChange?.(name);
          mockOnOperatorNameChange(name);
        }}
        onReasonChange={(reason) => {
          setState((prev) => ({ ...prev, reason }));
          props.onReasonChange?.(reason);
          mockOnReasonChange(reason);
        }}
        onClose={props.onClose ?? mockOnClose}
        onSubmit={props.onSubmit ?? mockOnSubmit}
        isAdmin={props.isAdmin ?? true}
      />
    );
  }

  it('renders nothing when state.isOpen is false', () => {
    render(
      <TestWrapper state={{ ...defaultState, isOpen: false }} />,
    );

    expect(screen.queryByTestId('rescue-modal')).not.toBeInTheDocument();
  });

  it('REFUSES NON-ADMIN EXECUTION: disables form inputs and confirm button when isAdmin is false', () => {
    render(
      <TestWrapper isAdmin={false} operatorName="Operator" />,
    );

    expect(screen.getByTestId('modal-unauthorized-message')).toBeInTheDocument();
    expect(screen.getByTestId('operator-name-input')).toBeDisabled();
    expect(screen.getByTestId('reason-input')).toBeDisabled();
    expect(screen.getByTestId('confirm-action-checkbox')).toBeDisabled();
    expect(screen.getByTestId('confirm-rescue-btn')).toBeDisabled();
  });

  it('REQUIRES MANDATORY CONFIRMATION STEP: button remains disabled until checkbox is checked', () => {
    render(
      <TestWrapper
        state={{ ...defaultState, reason: 'Valid reason' }}
        operatorName="Alice"
      />,
    );

    const confirmBtn = screen.getByTestId('confirm-rescue-btn');
    const checkbox = screen.getByTestId('confirm-action-checkbox');

    expect(confirmBtn).toBeDisabled();

    fireEvent.click(checkbox);

    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables confirm button if operator name or reason is missing even with checkbox checked', () => {
    render(
      <TestWrapper
        state={{ ...defaultState, reason: '' }}
        operatorName="Alice"
      />,
    );

    const checkbox = screen.getByTestId('confirm-action-checkbox');
    fireEvent.click(checkbox);

    expect(screen.getByTestId('confirm-rescue-btn')).toBeDisabled();
  });
});

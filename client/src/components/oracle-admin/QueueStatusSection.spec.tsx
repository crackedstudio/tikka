import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueueStatusSection } from './QueueStatusSection';

describe('QueueStatusSection Component', () => {
  it('renders pending, active, and failed job counts', () => {
    render(
      <QueueStatusSection
        pendingCount={5}
        activeCount={2}
        failedCount={1}
        circuitState="closed"
      />,
    );

    expect(screen.getByTestId('pending-count')).toHaveTextContent('5');
    expect(screen.getByTestId('active-count')).toHaveTextContent('2');
    expect(screen.getByTestId('failed-count')).toHaveTextContent('1');
    expect(screen.getByTestId('circuit-breaker-badge')).toHaveTextContent(/CLOSED/i);
  });

  it('handles missing circuit state gracefully', () => {
    render(
      <QueueStatusSection
        pendingCount={0}
        activeCount={0}
        failedCount={0}
      />,
    );

    expect(screen.queryByTestId('circuit-breaker-badge')).not.toBeInTheDocument();
  });
});

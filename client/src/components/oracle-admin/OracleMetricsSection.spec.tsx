import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OracleMetricsSection } from './OracleMetricsSection';

describe('OracleMetricsSection Component', () => {
  it('renders status and metrics accurately', () => {
    const mockStatus = {
      status: 'healthy' as const,
      components: [],
      circuitState: 'closed' as const,
      metrics: {
        totalProcessed: 150,
        totalFailed: 3,
        successRate: '98.0%',
      },
    };

    render(<OracleMetricsSection oracleStatus={mockStatus} />);

    expect(screen.getByTestId('oracle-status')).toHaveTextContent('healthy');
    expect(screen.getByTestId('total-processed')).toHaveTextContent('150');
    expect(screen.getByTestId('total-failed')).toHaveTextContent('3');
    expect(screen.getByTestId('success-rate')).toHaveTextContent('98.0%');
  });
});

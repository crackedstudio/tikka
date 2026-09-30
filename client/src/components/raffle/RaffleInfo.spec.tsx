import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RaffleInfo from './RaffleInfo';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../assets/svg/Line', () => ({ default: () => <hr /> }));

const renderInfo = (props: Partial<Parameters<typeof RaffleInfo>[0]> = {}) =>
  render(
    <MemoryRouter>
      <RaffleInfo
        title="Test Raffle"
        description="A test description"
        creator="GABCDEFGHILJKLMNOP"
        prizeValue="100"
        prizeCurrency="XLM"
        {...props}
      />
    </MemoryRouter>,
  );

describe('RaffleInfo', () => {
  it('renders the title', () => {
    renderInfo({ title: 'Epic Raffle' });
    expect(screen.getByText('Epic Raffle')).toBeInTheDocument();
  });

  it('renders the description', () => {
    renderInfo({ description: 'Great prize' });
    expect(screen.getByText('Great prize')).toBeInTheDocument();
  });

  it('displays truncated creator address', () => {
    renderInfo({ creator: 'GABCDEFGHILJKLMNOP' });
    expect(screen.getByText(/GABCDE...MNOP/)).toBeInTheDocument();
  });

  it('displays prize value and currency', () => {
    renderInfo({ prizeValue: '500', prizeCurrency: 'USDC' });
    expect(screen.getByText('500 USDC')).toBeInTheDocument();
  });

  it('shows the PRNG scheme for an XLM prize under 500', () => {
    renderInfo({ prizeValue: '100', prizeCurrency: 'XLM' });
    expect(screen.getByText(/Draw scheme: PRNG/)).toBeInTheDocument();
    expect(screen.getByText(/under the 500 XLM line/)).toBeInTheDocument();
  });

  it('shows the VRF scheme for an XLM prize of 500 or more', () => {
    renderInfo({ prizeValue: '500', prizeCurrency: 'XLM' });
    expect(screen.getByText(/Draw scheme: VRF/)).toBeInTheDocument();
    expect(screen.getByText(/500 XLM line/)).toBeInTheDocument();
  });
});

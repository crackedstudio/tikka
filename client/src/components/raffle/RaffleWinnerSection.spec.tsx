import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RaffleWinnerSection from './RaffleWinnerSection';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RaffleWinnerSection', () => {
    it('renders winner address and view proof link', () => {
        render(<RaffleWinnerSection winner="GDWINNERADDRESS" />);
        expect(screen.getByTestId('raffle-winner-section')).toBeInTheDocument();
        expect(screen.getByText('GDWINNERADDRESS')).toBeInTheDocument();
        expect(screen.getByText('raffle.viewProof')).toBeInTheDocument();
    });
});

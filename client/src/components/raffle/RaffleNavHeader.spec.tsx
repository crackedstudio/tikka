import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RaffleNavHeader from './RaffleNavHeader';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RaffleNavHeader', () => {
    it('renders back and share buttons', () => {
        render(<RaffleNavHeader onBack={vi.fn()} />);
        expect(screen.getByTestId('raffle-back-button')).toBeInTheDocument();
        expect(screen.getByTestId('raffle-share-button')).toBeInTheDocument();
    });

    it('calls onBack when back button is clicked', () => {
        const onBack = vi.fn();
        render(<RaffleNavHeader onBack={onBack} />);
        fireEvent.click(screen.getByTestId('raffle-back-button'));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('calls onShare when share button is clicked', () => {
        const onShare = vi.fn();
        render(<RaffleNavHeader onBack={vi.fn()} onShare={onShare} />);
        fireEvent.click(screen.getByTestId('raffle-share-button'));
        expect(onShare).toHaveBeenCalledTimes(1);
    });
});

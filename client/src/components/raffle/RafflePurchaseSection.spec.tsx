import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RafflePurchaseSection from './RafflePurchaseSection';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key }),
}));

vi.mock('../ui/ProgressBar', () => ({
    ProgressBar: ({ value }: { value: number }) => <div data-testid="progress-bar">{value}</div>,
}));

vi.mock('../ui/CountdownTimer', () => ({
    CountdownTimer: ({ endTime }: { endTime: number }) => <span data-testid="countdown">{endTime}</span>,
}));

vi.mock('../ui/AddToCalendar', () => ({
    default: ({ title }: { title: string }) => <button data-testid="add-to-calendar">{title}</button>,
}));

vi.mock('../../assets/svg/Line', () => ({
    default: () => <hr data-testid="line" />,
}));

const baseProps = {
    ticketPrice: '10',
    ticketPriceFormatted: '10 XLM',
    prizeCurrency: 'XLM',
    entries: 5,
    maxTickets: 100,
    progress: 5,
    endTime: 1234567890,
    isActive: true,
    isFinalized: false,
    winner: null,
    title: 'Test Raffle',
    onPurchase: vi.fn(),
};

describe('RafflePurchaseSection', () => {
    it('renders active purchase UI', () => {
        render(<RafflePurchaseSection {...baseProps} />);
        expect(screen.getByText('10 XLM')).toBeInTheDocument();
        expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
        expect(screen.getByTestId('buy-tickets-button')).toBeInTheDocument();
    });

    it('increments and decrements ticket count', () => {
        render(<RafflePurchaseSection {...baseProps} />);
        fireEvent.click(screen.getByTestId('increment-tickets'));
        expect(screen.getByTestId('ticket-count')).toHaveTextContent('2');
        fireEvent.click(screen.getByTestId('decrement-tickets'));
        expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
    });

    it('calls onPurchase with ticket count', () => {
        const onPurchase = vi.fn();
        render(<RafflePurchaseSection {...baseProps} onPurchase={onPurchase} />);
        fireEvent.click(screen.getByTestId('increment-tickets'));
        fireEvent.click(screen.getByTestId('buy-tickets-button'));
        expect(onPurchase).toHaveBeenCalledWith(2);
    });

    it('renders winner section when finalized and has winner', () => {
        render(<RafflePurchaseSection {...baseProps} isActive={false} isFinalized={true} winner="GDWINNER" />);
        expect(screen.getByTestId('raffle-winner-section')).toBeInTheDocument();
        expect(screen.getByText('GDWINNER')).toBeInTheDocument();
    });

    it('renders closed UI when not active and no winner', () => {
        render(<RafflePurchaseSection {...baseProps} isActive={false} />);
        expect(screen.getByText('raffle.participationClosed')).toBeInTheDocument();
    });
});

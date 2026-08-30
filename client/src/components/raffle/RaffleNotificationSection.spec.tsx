import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RaffleNotificationSection from './RaffleNotificationSection';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../NotificationSubscribeButton', () => ({
    default: ({ raffleId }: { raffleId: number }) => (
        <button data-testid="subscribe-button">Subscribe {raffleId}</button>
    ),
}));

describe('RaffleNotificationSection', () => {
    it('renders notification section with subscribe button', () => {
        render(<RaffleNotificationSection raffleId={42} />);
        expect(screen.getByTestId('raffle-notification-section')).toBeInTheDocument();
        expect(screen.getByTestId('subscribe-button')).toHaveTextContent('Subscribe 42');
    });
});

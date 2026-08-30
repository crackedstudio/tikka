import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RaffleParticipantsSection from './RaffleParticipantsSection';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../RecentParticipants', () => ({
    default: vi.fn(({ raffleId }: { raffleId: number }) => (
        <div data-testid="recent-participants">RecentParticipants {raffleId}</div>
    )),
}));

describe('RaffleParticipantsSection', () => {
    it('renders RecentParticipants with raffleId', () => {
        render(<RaffleParticipantsSection raffleId={42} currentUserAddress="GDABC" />);
        expect(screen.getByTestId('raffle-participants-section')).toBeInTheDocument();
        expect(screen.getByTestId('recent-participants')).toHaveTextContent('RecentParticipants 42');
    });
});

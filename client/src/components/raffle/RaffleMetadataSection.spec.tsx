import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RaffleMetadataSection from './RaffleMetadataSection';
import type { FormattedRaffle } from '../../types/types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../assets/svg/Line', () => ({
    default: () => <hr data-testid="line" />,
}));

const mockRaffle: FormattedRaffle = {
    id: 1,
    creator: 'GD1234567890ABCDEF',
    description: 'A test raffle description',
    prizeValue: '1000',
    prizeCurrency: 'XLM',
    ticketPriceFormatted: '10 XLM',
    metadata: {
        title: 'Test Raffle Title',
        description: 'A test raffle description',
        image: '',
        prizeName: 'Grand Prize',
        prizeValue: '1000',
        prizeCurrency: 'XLM',
        category: 'General',
        tags: [],
        createdBy: 'GD1234567890ABCDEF',
        createdAt: 0,
        updatedAt: 0,
    },
} as unknown as FormattedRaffle;

describe('RaffleMetadataSection', () => {
    it('renders title, description and prize', () => {
        render(
            <MemoryRouter>
                <RaffleMetadataSection raffle={mockRaffle} />
            </MemoryRouter>
        );
        expect(screen.getByText('Test Raffle Title')).toBeInTheDocument();
        expect(screen.getByText('A test raffle description')).toBeInTheDocument();
        expect(screen.getByText('1000 XLM')).toBeInTheDocument();
    });

    it('falls back to description when metadata title is missing', () => {
        const raffleWithoutTitle = {
            ...mockRaffle,
            metadata: { ...mockRaffle.metadata, title: '' },
        };
        render(
            <MemoryRouter>
                <RaffleMetadataSection raffle={raffleWithoutTitle} />
            </MemoryRouter>
        );
        expect(screen.getByText('A test raffle description')).toBeInTheDocument();
    });
});

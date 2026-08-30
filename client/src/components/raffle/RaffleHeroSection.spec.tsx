import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RaffleHeroSection from './RaffleHeroSection';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../LazyImage', () => ({
    default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} data-testid="lazy-image" />,
}));

describe('RaffleHeroSection', () => {
    it('renders live badge when active', () => {
        render(
            <RaffleHeroSection
                image="https://example.com/prize.jpg"
                title="Test Raffle"
                isActive={true}
                isFinalized={false}
            />
        );
        expect(screen.getByText('raffle.liveNow')).toBeInTheDocument();
        expect(screen.getByTestId('lazy-image')).toHaveAttribute('alt', 'Test Raffle');
    });

    it('renders finalized badge when finalized', () => {
        render(
            <RaffleHeroSection
                image="https://example.com/prize.jpg"
                title="Test Raffle"
                isActive={false}
                isFinalized={true}
            />
        );
        expect(screen.getByText('raffle.finalized')).toBeInTheDocument();
    });

    it('renders ended badge when inactive and not finalized', () => {
        render(
            <RaffleHeroSection
                image="https://example.com/prize.jpg"
                title="Test Raffle"
                isActive={false}
                isFinalized={false}
            />
        );
        expect(screen.getByText('raffle.ended')).toBeInTheDocument();
    });
});

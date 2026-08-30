import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RaffleFairnessSection from './RaffleFairnessSection';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RaffleFairnessSection', () => {
    it('renders fairness section', () => {
        render(<RaffleFairnessSection />);
        expect(screen.getByTestId('raffle-fairness-section')).toBeInTheDocument();
        expect(screen.getByText('raffle.provablyFair')).toBeInTheDocument();
    });
});

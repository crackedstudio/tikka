import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import RaffleHelmet from './RaffleHelmet';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RaffleHelmet', () => {
    it('sets document title', () => {
        render(
            <HelmetProvider>
                <RaffleHelmet title="Test Raffle" description="Test description" />
            </HelmetProvider>
        );
        expect(document.title).toBe('Test Raffle | Tikka Raffles');
    });
});

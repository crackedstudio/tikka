import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Skeleton from './Skeleton';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Skeleton', () => {
    it('renders with default classes', () => {
        render(<Skeleton />);
        const skeleton = screen.getByTestId('skeleton');
        expect(skeleton).toHaveClass('animate-pulse', 'bg-gray-200', 'rounded-2xl');
    });

    it('applies custom className', () => {
        render(<Skeleton className="h-10 w-32" />);
        const skeleton = screen.getByTestId('skeleton');
        expect(skeleton).toHaveClass('h-10', 'w-32');
    });
});

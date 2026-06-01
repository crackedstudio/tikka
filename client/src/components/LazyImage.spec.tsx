import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import LazyImage from './LazyImage';

describe('LazyImage', () => {
    it('renders the image with provided alt text', () => {
        render(<LazyImage src="https://example.com/prize.jpg" alt="Prize image" blurUp={false} />);

        expect(screen.getByAltText('Prize image')).toBeInTheDocument();
    });

    it('calls onLoad when the actual image loads', () => {
        const onLoad = vi.fn();

        render(
            <LazyImage
                src="https://example.com/prize.jpg"
                alt="Prize image"
                blurUp={false}
                onLoad={onLoad}
            />
        );

        const img = screen.getByTestId('lazyimage-img');
        fireEvent.load(img);

        expect(onLoad).toHaveBeenCalledTimes(1);
    });

    it('calls onError and renders a deterministic fallback when the image fails', () => {
        const onError = vi.fn();

        render(
            <LazyImage
                src="https://example.com/broken.jpg"
                alt="Broken image"
                blurUp={false}
                onError={onError}
            />
        );

        const img = screen.getByTestId('lazyimage-img');
        fireEvent.error(img);

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0]).toMatchObject({ type: 'error' });
        expect(screen.getByTestId('lazyimage-fallback')).toBeInTheDocument();
        expect(screen.queryByTestId('lazyimage-img')).not.toBeInTheDocument();
    });

    it('preserves explicit aspect ratio styling on the container', () => {
        render(
            <LazyImage
                src="https://example.com/prize.jpg"
                alt="Prize image"
                blurUp={false}
                aspectRatio="4/3"
            />
        );

        expect(screen.getByTestId('lazyimage-container')).toHaveStyle({ aspectRatio: '4/3' });
    });
});

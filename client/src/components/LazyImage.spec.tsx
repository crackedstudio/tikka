/**
 * LazyImage Tests
 *
 * Tests for loading, error fallback, and alt text behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LazyImage from './LazyImage';

// Mock IntersectionObserver for tests
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
    (global as any).IntersectionObserver = vi.fn(() => ({
        observe: mockObserve,
        unobserve: vi.fn(),
        disconnect: mockDisconnect,
    }));
});

afterEach(() => {
    vi.clearAllMocks();
    delete (global as any).IntersectionObserver;
});

describe('LazyImage', () => {
    it('renders with correct alt text', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image description"
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('alt', 'Test image description');
    });

    it('shows blur placeholder initially when blurUp is true', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={true}
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml;base64'));
    });

    it('loads the image directly when blurUp is false', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={false}
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('sets aspect ratio on container when provided as number', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                aspectRatio={16/9}
                blurUp={false}
            />
        );

        const container = screen.getByRole('img').parentElement;
        expect(container).toHaveStyle({ aspectRatio: '1.7777777777777777' });
    });

    it('sets aspect ratio on container when provided as string', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                aspectRatio="1"
                blurUp={false}
            />
        );

        const container = screen.getByRole('img').parentElement;
        expect(container).toHaveStyle({ aspectRatio: '1' });
    });

    it('calls onLoad callback when image loads successfully', async () => {
        const onLoad = vi.fn();

        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={false}
                onLoad={onLoad}
            />
        );

        const img = screen.getByRole('img');
        fireEvent.load(img);

        await waitFor(() => {
            expect(onLoad).toHaveBeenCalled();
        });
    });

    it('displays error fallback when image fails to load', async () => {
        const onError = vi.fn();

        render(
            <LazyImage
                src="https://example.com/broken.jpg"
                alt="Test image"
                blurUp={false}
                onError={onError}
            />
        );

        const img = screen.getByRole('img');
        fireEvent.error(img);

        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith('https://example.com/broken.jpg');
        });

        // Check error fallback UI
        const fallback = screen.getByText('Test image');
        expect(fallback).toBeInTheDocument();
    });

    it('uses alt text in fallback when image fails', async () => {
        render(
            <LazyImage
                src="https://example.com/broken.jpg"
                alt="Prize item image"
                blurUp={false}
            />
        );

        const img = screen.getByRole('img');
        fireEvent.error(img);

        await waitFor(() => {
            expect(screen.getByText('Prize item image')).toBeInTheDocument();
        });
    });

    it('shows "Image unavailable" fallback when alt is empty and error occurs', async () => {
        render(
            <LazyImage
                src="https://example.com/broken.jpg"
                alt=""
                blurUp={false}
            />
        );

        const img = screen.getByRole('img');
        fireEvent.error(img);

        await waitFor(() => {
            expect(screen.getByText('Image unavailable')).toBeInTheDocument();
        });
    });

    it('applies custom className to image', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={false}
                className="custom-image-class"
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveClass('custom-image-class');
    });

    it('applies custom containerClassName to container', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={false}
                containerClassName="custom-container-class"
            />
        );

        const container = screen.getByRole('img').parentElement;
        expect(container).toHaveClass('custom-container-class');
    });

    it('sets opacity-100 after image loads', async () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={false}
            />
        );

        const img = screen.getByRole('img');
        fireEvent.load(img);

        await waitFor(() => {
            expect(img).toHaveClass('opacity-100');
        });
    });

    it('sets lazy loading attributes on image', () => {
        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={false}
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(img).toHaveAttribute('decoding', 'async');
    });

    it('loads image immediately when IntersectionObserver is not supported', () => {
        delete (global as any).IntersectionObserver;

        render(
            <LazyImage
                src="https://example.com/image.jpg"
                alt="Test image"
                blurUp={true}
            />
        );

        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
    });
});